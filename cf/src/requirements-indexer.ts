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
      // Load requirements data from local file
      const requirementsData = await import("../data/requirements.json");
      const requirements = requirementsData.default || requirementsData;

      let totalIndexed = 0;

      // Process each degree program
      for (const program of requirements) {
        const programName = program.name;
        const degreeLevel = program.degree_level;

        // Index each requirement category
        for (const requirement of program.requirements) {
          for (const category of requirement.categories) {
            // Create searchable text for each category
            const categoryText = `
              Degree Program: ${programName} (${degreeLevel})
              Requirement Type: ${requirement.type}
              Category: ${category.category_name}
              
              Course Options:
              ${category.courses.map(courseGroup => {
                let text = `Primary: ${courseGroup.primary.join(', ')}`;
                if (courseGroup.replacements && courseGroup.replacements.length > 0) {
                  text += `\nAlternatives: ${courseGroup.replacements.map(alt => alt.join(', ')).join(' OR ')}`;
                }
                return text;
              }).join('\n\n')}
            `.trim();

            // Generate embedding for this category
            const response = await env.AI.run(env.EMBED_MODEL as any, { text: [categoryText] });
            const vector = (response as any).data?.[0] || (response as any)[0];

            if (vector) {
              // Create unique ID for this requirement category (max 64 bytes)
              const id = `${programName.substring(0, 10)}-${requirement.type.substring(0, 10)}-${totalIndexed}`.replace(/[^a-zA-Z0-9-_]/g, '-');
              
              await env.REQUIREMENTS_INDEX.upsert([{
                id: id,
                values: vector,
                metadata: {
                  program_name: programName,
                  degree_level: degreeLevel,
                  requirement_type: requirement.type,
                  category_name: category.category_name,
                  courses: JSON.stringify(category.courses),
                  searchable_text: categoryText
                }
              }]);

              totalIndexed++;
            }
          }
        }
      }

      return new Response(`Successfully indexed ${totalIndexed} requirement categories`);
    } catch (error) {
      console.error("Requirements indexing error:", error);
      return new Response("Error during requirements indexing: " + (error as Error).message, { status: 500 });
    }
  }
};