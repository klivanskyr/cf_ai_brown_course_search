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
        return {
          course: metadata.name,
          title: metadata.course_name,
          department: metadata.department,
          instructor: metadata.instructor,
          description: metadata.description,
          location: metadata.location,
          enrollment: `${metadata.seats_available}/${metadata.maximum_enrollment} seats available`,
          schedule: metadata.schedule ? JSON.parse(metadata.schedule) : null,
          relevanceScore: Math.round(match.score * 100) / 100
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
      const requirementsQuery = `${major} degree requirements prerequisites next courses after ${coursesTaken.join(' ')} ${interests || ''}`;
      
      // Generate embedding for requirements search
      const response = await env.AI.run(env.EMBED_MODEL, { text: [requirementsQuery] });
      const queryVector = (response as any).data?.[0] || (response as any)[0];

      if (!queryVector) {
        return "Could not analyze your degree requirements.";
      }

      // Search requirements database
      const requirementsResults = await env.REQUIREMENTS_INDEX.query(queryVector, {
        topK: 5,
        returnValues: false,
        returnMetadata: "all"
      });

      if (!requirementsResults?.matches?.length) {
        return `No degree requirements found for ${major}. Make sure you've entered your major correctly.`;
      }

      // Analyze the requirements and extract recommended courses
      const recommendations = [];
      const coursesToSearch = new Set<string>();

      for (const match of requirementsResults.matches) {
        const metadata = match.metadata;
        if (metadata.program_name.toLowerCase().includes(major.toLowerCase())) {
          const courses = JSON.parse(metadata.courses);
          
          // Extract course codes from the requirements
          for (const courseGroup of courses) {
            // Check primary courses
            for (const courseCode of courseGroup.primary) {
              if (!coursesTaken.includes(courseCode)) {
                coursesToSearch.add(courseCode);
              }
            }
            
            // Check replacement options
            if (courseGroup.replacements) {
              for (const replacement of courseGroup.replacements) {
                for (const courseCode of replacement) {
                  // Only add if it looks like a course code (has letters and numbers)
                  if (courseCode.match(/^[A-Z]{3,4}\s+\d{4}/) && !coursesTaken.includes(courseCode)) {
                    coursesToSearch.add(courseCode);
                  }
                }
              }
            }
          }
          
          recommendations.push({
            requirementType: metadata.requirement_type,
            category: metadata.category_name,
            relevanceScore: Math.round(match.score * 100) / 100
          });
        }
      }

      // Search for detailed course information for recommended courses
      const courseDetails = [];
      for (const courseCode of Array.from(coursesToSearch).slice(0, 8)) { // Limit to avoid too many searches
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
              
              courseDetails.push({
                course: courseMetadata.name,
                title: courseMetadata.course_name,
                department: courseMetadata.department,
                instructor: courseMetadata.instructor,
                description: courseMetadata.description,
                enrollment: `${courseMetadata.seats_available}/${courseMetadata.maximum_enrollment} seats available`
              });
            }
          }
        } catch (error) {
          console.log(`Could not find details for course: ${courseCode}`);
        }
      }

      return {
        major: major,
        coursesTaken: coursesTaken,
        analysis: `Based on your ${major} major and completed courses (${coursesTaken.join(', ')}), here are your next steps:`,
        recommendedRequirements: recommendations,
        suggestedCourses: courseDetails,
        nextSteps: courseDetails.length > 0 ? 
          `Consider taking: ${courseDetails.slice(0, 3).map(c => c.course).join(', ')}` :
          `Continue with your core ${major} requirements. Consider speaking with your academic advisor for personalized guidance.`
      };
    } catch (error) {
      console.error("Error in degree planning", error);
      return `Error analyzing your degree plan: ${error}`;
    }
  }
});

/**
 * Export all available tools
 * These will be provided to the AI model to describe available capabilities
 */
export const tools = {
  searchBrownCourses,
  getDegreePlanningRecommendations
} satisfies ToolSet;

/**
 * Implementation of confirmation-required tools
 * This object contains the actual logic for tools that need human approval
 * Each function here corresponds to a tool above that doesn't have an execute function
 */
export const executions = {
  // No confirmation-required tools currently
};
