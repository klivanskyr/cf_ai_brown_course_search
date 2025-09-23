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
      const coursesData = await import("../data/cab_normalized.json");
      const data = coursesData.default || coursesData;

      // Flatten all courses from all semesters into a single array
      const allCourses: any[] = [];
      for (const semester in data) {
        const semesterCourses = (data as any)[semester];
        if (Array.isArray(semesterCourses)) {
          allCourses.push(...semesterCourses);
        }
      }

      const BATCH = 128;
      for (let i = 0; i < allCourses.length; i += BATCH) {
        const batch = allCourses.slice(i, i + BATCH);
        const texts = batch.map(c => `${c.course_name}\n${c.description}\nDepartment: ${c.department}\nInstructor: ${c.instructor}\nSemester: ${c.semester}`);
        
        // Use the AI binding to generate embeddings
        const response = await env.AI.run(env.EMBED_MODEL as any, { text: texts });
        const vectors = (response as any).data || response;
        
        await env.COURSE_INDEX.upsert(
          batch.map((c, j) => ({ 
            id: `${c.crn}-${c.semester}`, 
            values: vectors[j], 
            metadata: {
              crn: c.crn,
              semester: c.semester,
              department: c.department,
              course_number: c.course_number,
              course_name: c.course_name,
              section: c.section,
              instructor: c.instructor,
              description: c.description,
              location: c.location,
              maximum_enrollment: c.maximum_enrollment?.toString() || "",
              seats_available: c.seats_available?.toString() || "",
              schedule: JSON.stringify(c.schedule),
              attributes: JSON.stringify(c.attributes || []),
              restrictions: c.restrictions || "",
              exam: c.exam || ""
            }
          }))
        );
      }
      return new Response(`Indexed ${allCourses.length} courses successfully`);
    } catch (error) {
      console.error("Indexing error:", error);
      return new Response("Error during indexing: " + (error as Error).message, { status: 500 });
    }
  }
};
