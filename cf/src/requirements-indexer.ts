import { Ai } from "@cloudflare/ai";
import type { Vectorize } from "@cloudflare/workers-types";

interface Env { 
  AI: Ai; 
  REQUIREMENTS_INDEX: Vectorize; 
  EMBED_MODEL: string; 
}

export default {
  async fetch(_req: Request, env: Env): Promise<Response> {
    try {
      // Load concentrations data from local file
      const concentrationsData = await import("../data/concentrations.json");
      const concentrations = concentrationsData.default || concentrationsData;

      let totalIndexed = 0;
      const BATCH_SIZE = 20; // Smaller batch size for better performance

      console.log(`Processing ${concentrations.length} concentrations...`);

      // Process concentrations in smaller batches
      for (let i = 0; i < concentrations.length; i += BATCH_SIZE) {
        const batch = concentrations.slice(i, i + BATCH_SIZE);
        const batchTexts = [];
        const batchMetadata = [];

        for (const concentration of batch) {
          try {
            // Extract concentration name from URL
            const urlMatch = concentration.url.match(/concentrations\/([^\/]+)\//);
            const concentrationCode = urlMatch ? urlMatch[1].toUpperCase() : 'UNKNOWN';
            
            // Try to get a better concentration name
            const concentrationName = getConcentrationName(concentrationCode);

            // Process each requirement area (process all, not limited)
            for (let reqIndex = 0; reqIndex < concentration.requirements.length; reqIndex++) {
              const requirement = concentration.requirements[reqIndex];
              
              if (requirement.courses && requirement.courses.length > 0) {
                // Create comprehensive searchable text for each requirement area
                const requirementText = `
                  Concentration: ${concentrationName} (${concentrationCode})
                  Requirement Area: ${requirement.area}
                  
                  Required Courses:
                  ${requirement.courses.map(course => {
                    let courseText = `${course.code} - ${course.title}`;
                    if (course.credits) courseText += ` (${course.credits} credits)`;
                    return courseText;
                  }).join('\n')}
                  
                  This is a ${requirement.area} requirement for the ${concentrationName} concentration.
                  Students majoring in ${concentrationName} need to complete these courses to fulfill this requirement area.
                `.trim();

                batchTexts.push(requirementText);
                batchMetadata.push({
                  concentration_code: concentrationCode,
                  concentration_name: concentrationName,
                  area: requirement.area,
                  url: concentration.url,
                  courses: JSON.stringify(requirement.courses),
                  course_codes: requirement.courses.map(c => c.code).join(', '),
                  id: `${concentrationCode}-${requirement.area.replace(/[^a-zA-Z0-9]/g, '').substring(0, 20)}-${totalIndexed}`.substring(0, 63)
                });
                totalIndexed++;
              }
            }
          } catch (error) {
            console.error(`Error processing concentration ${i}:`, error);
            continue;
          }
        }

        if (batchTexts.length > 0) {
          try {
            // Generate embeddings for this batch
            const response = await env.AI.run(env.EMBED_MODEL as any, { text: batchTexts });
            const vectors = (response as any).data || response;

            // Upsert to vector database
            await env.REQUIREMENTS_INDEX.upsert(
              batchMetadata.map((meta, j) => ({
                id: meta.id,
                values: vectors[j],
                metadata: {
                  concentration_code: meta.concentration_code,
                  concentration_name: meta.concentration_name,
                  area: meta.area,
                  url: meta.url,
                  courses: meta.courses,
                  course_codes: meta.course_codes
                }
              }))
            );

            console.log(`Processed batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(concentrations.length/BATCH_SIZE)}, indexed ${totalIndexed} total`);
          } catch (error) {
            console.error(`Error processing batch at index ${i}:`, error);
            continue;
          }
        }
      }

      return new Response(`Successfully indexed ${totalIndexed} concentration requirements`);
    } catch (error) {
      console.error("Requirements indexing error:", error);
      return new Response("Error during requirements indexing: " + (error as Error).message, { status: 500 });
    }
  }
};

function getConcentrationName(code: string): string {
  const concentrationNames: Record<string, string> = {
    'COMP': 'Computer Science',
    'MATH': 'Mathematics', 
    'PHYS': 'Physics',
    'CHEM': 'Chemistry',
    'BIOL': 'Biology',
    'CSCI': 'Computer Science',
    'ECON': 'Economics',
    'PSYC': 'Psychology',
    'HIST': 'History',
    'ENGL': 'English',
    'PHIL': 'Philosophy',
    'POLS': 'Political Science',
    'ANTH': 'Anthropology',
    'SOCI': 'Sociology',
    'AFRI': 'Africana Studies',
    'AMST': 'American Studies',
    'APMA': 'Applied Mathematics',
    'ENGN': 'Engineering',
    'ENVS': 'Environmental Studies'
    // Add more as needed
  };
  
  return concentrationNames[code] || code;
}