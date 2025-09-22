import { Ai } from "@cloudflare/ai";
import type { Vectorize } from "@cloudflare/workers-types";

interface Env { 
  AI: Ai; 
  COURSE_INDEX: Vectorize; 
  EMBED_MODEL: string; 
}

export default {
  async fetch(_req: Request, env: Env): Promise<Response> {
    try {
      // Load courses data from local file
      const coursesData = await import("../data/brown_courses.json");
      const courses = coursesData.default || coursesData;

      const BATCH = 128;
      for (let i = 0; i < courses.length; i += BATCH) {
        const batch = courses.slice(i, i + BATCH);
        const texts = batch.map(c => `${c.course_name}\n${c.description}\nDepartment: ${c.department}\nInstructor: ${c.instructor}`);
        
        // Use the AI binding to generate embeddings
        const response = await env.AI.run(env.EMBED_MODEL as any, { text: texts });
        const vectors = (response as any).data || response;
        
        await env.COURSE_INDEX.upsert(
          batch.map((c, j) => ({ 
            id: c.name, 
            values: vectors[j], 
            metadata: {
              name: c.name,
              department: c.department,
              course_number: c.course_number,
              course_name: c.course_name,
              instructor: c.instructor,
              description: c.description,
              location: c.location,
              maximum_enrollment: c.maximum_enrollment.toString(),
              seats_available: c.seats_available.toString(),
              schedule: JSON.stringify(c.schedule)
            }
          }))
        );
      }
      return new Response(`Indexed ${courses.length} courses successfully`);
    } catch (error) {
      console.error("Indexing error:", error);
      return new Response("Error during indexing: " + (error as Error).message, { status: 500 });
    }
  }
};
