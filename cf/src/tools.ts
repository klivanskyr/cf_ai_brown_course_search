/**
 * Tool definitions for the AI chat agent
 * Tools can either require human confirmation or execute automatically
 */
import { tool, type ToolSet } from "ai";
import { z } from "zod/v3";

import type { Chat } from "./server";
import { getCurrentAgent } from "agents";

/**
 * Tool to search for Brown University courses
 * This executes automatically and searches the vectorized course database
 */
const searchBrownCourses = tool({
  description: "Search for Brown University courses by course name, description, department, or any course-related keywords",
  inputSchema: z.object({
    query: z.string().describe("The search query for courses (e.g., 'computer science', 'CSCI 0190', 'machine learning', etc.)")
  }),
  execute: async ({ query }) => {
    const { agent } = getCurrentAgent<Chat>();
    try {
      // Access the environment through the state property which should be public
      const env = (agent as any).state?.env || (agent as any).env;
      
      if (!env?.COURSE_INDEX) {
        return "Course search is not available - vectorize index not found.";
      }

      if (!env?.AI || !env?.EMBED_MODEL) {
        return "Course search is not available - AI embedding service not configured.";
      }

      // Generate embedding for the search query
      const response = await env.AI.run(env.EMBED_MODEL, { text: [query] });
      const queryVector = (response as any).data?.[0] || (response as any)[0];

      if (!queryVector) {
        return "Could not generate search embedding for your query.";
      }

      // Search the vectorize database
      const results = await env.COURSE_INDEX.query(queryVector, {
        topK: 5,
        returnValues: false,
        returnMetadata: "all"
      });

      if (!results?.matches?.length) {
        return `No courses found matching "${query}". Try searching with different keywords like course codes (e.g., "CSCI 0190"), department names, or general topics.`;
      }

      // Format the results
      const courses = results.matches.map((match: any) => {
        const metadata = match.metadata;
        const schedule = metadata.schedule ? JSON.parse(metadata.schedule) : [];
        const attributes = metadata.attributes ? JSON.parse(metadata.attributes) : [];
        
        return {
          course: `${metadata.department} ${metadata.course_number}`,
          section: metadata.section,
          title: metadata.course_name,
          department: metadata.department,
          instructor: metadata.instructor,
          description: metadata.description,
          location: metadata.location,
          semester: metadata.semester,
          enrollment: `${metadata.seats_available}/${metadata.maximum_enrollment} seats available`,
          schedule: schedule.length > 0 ? schedule.map((s: any) => `${s.day} ${s.start_time}-${s.end_time}`).join(', ') : 'Schedule TBD',
          attributes: attributes.length > 0 ? attributes : [],
          restrictions: metadata.restrictions || 'None',
          exam: metadata.exam || 'No final exam scheduled',
          relevanceScore: Math.round(match.score * 100) / 100,
          crn: metadata.crn
        };
      });

      return {
        searchQuery: query,
        resultsFound: courses.length,
        courses: courses
      };
    } catch (error) {
      console.error("Error searching courses", error);
      return `Error searching for courses: ${error}`;
    }
  }
});

/**
 * Tool to provide degree planning recommendations based on courses taken
 * This tool analyzes degree requirements and completed courses to suggest next steps
 */
const getDegreePlanningRecommendations = tool({
  description: "Get personalized course recommendations based on your major and courses you've already taken. Analyzes degree requirements to suggest what courses to take next.",
  inputSchema: z.object({
    major: z.string().describe("Your major (e.g., 'computer science', 'mathematics', etc.)"),
    coursesTaken: z.array(z.string()).describe("List of course codes you've already taken (e.g., ['CSCI 0190', 'MATH 0170'])"),
    interests: z.string().optional().describe("Optional: Any specific interests or areas you want to focus on")
  }),
  execute: async ({ major, coursesTaken, interests }) => {
    const { agent } = getCurrentAgent<Chat>();
    try {
      const env = (agent as any).state?.env || (agent as any).env;
      
      if (!env?.REQUIREMENTS_INDEX || !env?.COURSE_INDEX || !env?.AI || !env?.EMBED_MODEL) {
        return "Degree planning is not available - required services not configured.";
      }

      // Create search query for degree requirements
      const requirementsQuery = `${major} concentration requirements courses after completing ${coursesTaken.join(' ')} next steps ${interests || ''}`;
      
      // Generate embedding for requirements search
      const response = await env.AI.run(env.EMBED_MODEL, { text: [requirementsQuery] });
      const queryVector = (response as any).data?.[0] || (response as any)[0];

      if (!queryVector) {
        return "Could not analyze your degree requirements.";
      }

      // Search requirements database
      const requirementsResults = await env.REQUIREMENTS_INDEX.query(queryVector, {
        topK: 10, // Get more results for better matching
        returnValues: false,
        returnMetadata: "all"
      });

      if (!requirementsResults?.matches?.length) {
        return `No degree requirements found for ${major}. Make sure you've entered your major correctly (e.g., 'Computer Science', 'Mathematics', 'Biology').`;
      }

      // Find the best matching concentration and analyze requirements
      let bestMatch = null;
      let matchingRequirements = [];
      
      for (const match of requirementsResults.matches) {
        const metadata = match.metadata;
        const concentrationName = metadata.concentration_name || metadata.concentration_code;
        
        if (concentrationName && concentrationName.toLowerCase().includes(major.toLowerCase())) {
          bestMatch = {
            name: concentrationName,
            code: metadata.concentration_code
          };
          
          // Parse the courses for this requirement area
          const courses = JSON.parse(metadata.courses || '[]');
          const courseCodes = metadata.course_codes ? metadata.course_codes.split(', ') : [];
          
          // Check which courses are already completed vs still needed
          const completedCourses = courseCodes.filter((code: string) => 
            coursesTaken.some(taken => taken.toUpperCase().includes(code.replace(/\s+/g, ' ').toUpperCase()))
          );
          const neededCourses = courseCodes.filter((code: string) => 
            !coursesTaken.some(taken => taken.toUpperCase().includes(code.replace(/\s+/g, ' ').toUpperCase()))
          );
          
          matchingRequirements.push({
            area: metadata.area,
            completedCourses: completedCourses,
            neededCourses: neededCourses.slice(0, 5), // Limit to avoid overwhelming
            allCourses: courseCodes,
            relevanceScore: Math.round(match.score * 100) / 100,
            isCompleted: neededCourses.length === 0 && completedCourses.length > 0
          });
          
          if (bestMatch) break; // Found our concentration, get all its requirements
        }
      }

      // Get detailed course information for recommended next courses
      const recommendedCourses = [];
      const allNeededCourses = matchingRequirements.flatMap(req => req.neededCourses).slice(0, 8);
      
      for (const courseCode of allNeededCourses) {
        try {
          const courseResponse = await env.AI.run(env.EMBED_MODEL, { text: [courseCode] });
          const courseVector = (courseResponse as any).data?.[0] || (courseResponse as any)[0];
          
          if (courseVector) {
            const courseResults = await env.COURSE_INDEX.query(courseVector, {
              topK: 1,
              returnValues: false,
              returnMetadata: "all"
            });
            
            if (courseResults?.matches?.length > 0) {
              const courseMatch = courseResults.matches[0];
              const courseMetadata = courseMatch.metadata;
              
              // Only include if it's a close match to the course code we're looking for
              if (courseMetadata.crn && (courseMetadata.course_name?.toLowerCase().includes(courseCode.toLowerCase()) || 
                  courseCode.toLowerCase().includes(courseMetadata.department?.toLowerCase() || ''))) {
                recommendedCourses.push({
                  code: `${courseMetadata.department} ${courseMetadata.course_number}`,
                  title: courseMetadata.course_name,
                  instructor: courseMetadata.instructor,
                  description: courseMetadata.description?.substring(0, 200) + '...',
                  semester: courseMetadata.semester,
                  availability: `${courseMetadata.seats_available}/${courseMetadata.maximum_enrollment} seats available`
                });
              }
            }
          }
        } catch (error) {
          console.log(`Could not find details for course: ${courseCode}`);
        }
      }

      const progressSummary = matchingRequirements.map(req => ({
        requirementArea: req.area,
        status: req.isCompleted ? 'Completed' : `${req.completedCourses.length}/${req.allCourses.length} completed`,
        completed: req.completedCourses,
        stillNeeded: req.neededCourses.slice(0, 3) // Show top 3 needed courses per area
      }));

      return {
        concentration: bestMatch ? `${bestMatch.name} (${bestMatch.code})` : major,
        coursesTaken: coursesTaken,
        progressAnalysis: progressSummary,
        recommendedNextCourses: recommendedCourses.slice(0, 5),
        summary: `Based on your ${bestMatch?.name || major} concentration and completed courses (${coursesTaken.join(', ')}), you have progress in ${progressSummary.filter(p => p.status.includes('/')).length} requirement areas. ${recommendedCourses.length > 0 ? `Consider taking: ${recommendedCourses.slice(0, 3).map(c => c.code).join(', ')}.` : 'Continue working through your core requirements.'}`
      };
    } catch (error) {
      console.error("Error in degree planning", error);
      return `Error analyzing your degree plan: ${error}`;
    }
  }
});

/**
 * Tool to look up all requirements for a specific concentration/major
 * This tool provides comprehensive degree requirements information
 */
const getConcentrationRequirements = tool({
  description: "Get all degree requirements for a specific concentration/major at Brown University. Shows all requirement areas, courses needed, and detailed information about the concentration.",
  inputSchema: z.object({
    concentration: z.string().describe("The concentration/major name (e.g., 'Computer Science', 'Mathematics', 'Biology', etc.)")
  }),
  execute: async ({ concentration }) => {
    const { agent } = getCurrentAgent<Chat>();
    try {
      const env = (agent as any).state?.env || (agent as any).env;
      
      if (!env?.REQUIREMENTS_INDEX || !env?.AI || !env?.EMBED_MODEL) {
        return "Concentration requirements lookup is not available - required services not configured.";
      }

      // Create search query for the specific concentration
      const requirementsQuery = `${concentration} concentration major requirements all areas courses needed`;
      
      // Generate embedding for requirements search
      const response = await env.AI.run(env.EMBED_MODEL, { text: [requirementsQuery] });
      const queryVector = (response as any).data?.[0] || (response as any)[0];

      if (!queryVector) {
        return "Could not search for concentration requirements.";
      }

      // Search requirements database for this specific concentration
      const requirementsResults = await env.REQUIREMENTS_INDEX.query(queryVector, {
        topK: 20, // Get more results to capture all requirement areas for the concentration
        returnValues: false,
        returnMetadata: "all"
      });

      if (!requirementsResults?.matches?.length) {
        return `No requirements found for ${concentration}. Make sure the concentration name is correct. Common concentrations include: Computer Science, Mathematics, Biology, Chemistry, Physics, Economics, Psychology, History, English.`;
      }

      // Group requirements by concentration and area
      const concentrationData = new Map();
      
      for (const match of requirementsResults.matches) {
        const metadata = match.metadata;
        const concentrationName = metadata.concentration_name || metadata.concentration_code;
        
        // Only include if it's a good match for the requested concentration
        if (concentrationName && concentrationName.toLowerCase().includes(concentration.toLowerCase())) {
          const key = `${metadata.concentration_code}-${metadata.concentration_name}`;
          
          if (!concentrationData.has(key)) {
            concentrationData.set(key, {
              code: metadata.concentration_code,
              name: metadata.concentration_name,
              url: metadata.url,
              requirements: []
            });
          }
          
          const courses = JSON.parse(metadata.courses || '[]');
          const courseCodes = metadata.course_codes ? metadata.course_codes.split(', ') : [];
          
          concentrationData.get(key).requirements.push({
            area: metadata.area,
            courses: courses.slice(0, 10), // Limit to avoid overwhelming output
            courseCodes: courseCodes.slice(0, 10),
            totalCourses: courseCodes.length,
            relevanceScore: Math.round(match.score * 100) / 100
          });
        }
      }

      if (concentrationData.size === 0) {
        return `No exact match found for "${concentration}". Try searching with alternative names or check the spelling.`;
      }

      // Format the results for the first/best matching concentration
      const [bestMatch] = concentrationData.values();
      
      // Sort requirements by relevance score
      bestMatch.requirements.sort((a: any, b: any) => b.relevanceScore - a.relevanceScore);
      
      // Count total unique courses across all requirements
      const allCourses = new Set();
      bestMatch.requirements.forEach((req: any) => {
        req.courseCodes.forEach((code: string) => allCourses.add(code));
      });

      return {
        concentration: `${bestMatch.name} (${bestMatch.code})`,
        officialUrl: bestMatch.url,
        totalRequirementAreas: bestMatch.requirements.length,
        estimatedTotalCourses: allCourses.size,
        requirementAreas: bestMatch.requirements.map((req: any) => ({
          area: req.area,
          coursesInArea: req.totalCourses,
          sampleCourses: req.courseCodes.slice(0, 5), // Show first 5 as examples
          courses: req.courses.map((course: any) => ({
            code: course.code,
            title: course.title
          })).slice(0, 5) // Show first 5 course details
        })),
        summary: `The ${bestMatch.name} concentration has ${bestMatch.requirements.length} requirement areas with approximately ${allCourses.size} courses total. Major areas include: ${bestMatch.requirements.slice(0, 5).map((r: any) => r.area).join(', ')}.`
      };
    } catch (error) {
      console.error("Error in concentration requirements lookup", error);
      return `Error looking up concentration requirements: ${error}`;
    }
  }
});

/**
 * Export all available tools
 * These will be provided to the AI model to describe available capabilities
 */
export const tools = {
  searchBrownCourses,
  getDegreePlanningRecommendations,
  getConcentrationRequirements
} satisfies ToolSet;

/**
 * Implementation of confirmation-required tools
 * This object contains the actual logic for tools that need human approval
 * Each function here corresponds to a tool above that doesn't have an execute function
 */
export const executions = {
  // No confirmation-required tools currently
};
