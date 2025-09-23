# Prompts
```
"Optional Assignment: See instructions below for Cloudflare AI app assignment. SUBMIT GitHub repo URL for the AI project here. (Please do not submit irrelevant repositories.)

Optional Assignment Instructions: We plan to fast track review of candidates who complete an assignment to build a type of AI-powered application on Cloudflare. An AI-powered application should include the following components:

- LLM (recommend using Llama 3.3 on Workers AI), or an external LLM of your choice
- Workflow / coordination (recommend using Workflows, Workers or Durable Objects)
- User input via chat or voice (recommend using Pages or Realtime)
- Memory or state

https://developers.cloudflare.com/agents/

Find additional documentation here."
```

```
"I want to build a ai agent that will help you find courses at brown university based on your interests and based on the requirements. I already have a massive json of all the courses and requirements. how to build the ai chatbot.

walk me through how to make this step by step"
```

```
"what do i need to update if this is the new data structure 

[
    {
        "name": "CSCI 0190",
        "department": "CSCI",
        "course_number": "0190",
        "course_name": "Accelerated Introduction to Computer Science",
        "maximum_enrollment": 30,
        "seats_available": 25,
        "instructor": "Dr. Jane Smith",
        "description": "An accelerated introduction to the fundamentals of computer science, covering programming, algorithms, and data structures.",
        "location": "CIT Center (Thomas Watson CIT) 368",
        "schedule": [
            {
                "day": "Monday",
                "start_time": "9:00 AM",
                "end_time": "9:50 AM"
            },
            {
                "day": "Wednesday",
                "start_time": "9:00 AM",
                "end_time": "9:50 AM"
            },
            {
                "day": "Friday",
                "start_time": "9:00 AM",
                "end_time": "9:50 AM"
            }
        ]
    },
    {
        "name": "MATH 0210",
        "department": "MATH",
        "course_number": "0210",
        "course_name": "Calculus I",
        "maximum_enrollment": 40,
        "seats_available": 10,
        "instructor": "Prof. John Doe",
        "description": "An introduction to differential and integral calculus of one variable, including limits, derivatives, and integrals.",
        "location": "Science Center 101",
        "schedule": [
            {
                "day": "Tuesday",
                "start_time": "11:00 AM",
                "end_time": "11:50 AM"
            },
            {
                "day": "Thursday",
                "start_time": "11:00 AM",
                "end_time": "11:50 AM"
            }
        ]
    }
]"
```


```
"Now i need to build 2 webscrapers. 1 will scrape cab.brown.edu for formatted classes like [
    {
        "name": "CSCI 0190",
        "department": "CSCI",
        "course_number": "0190",
        "course_name": "Accelerated Introduction to Computer Science",
        "maximum_enrollment": 30,
        "seats_available": 25,
        "instructor": "Dr. Jane Smith",
        "description": "An accelerated introduction to the fundamentals of computer science, covering programming, algorithms, and data structures.",
        "location": "CIT Center (Thomas Watson CIT) 368",
        "schedule": [
            {
                "day": "Monday",
                "start_time": "9:00 AM",
                "end_time": "9:50 AM"
            },
            {
                "day": "Wednesday",
                "start_time": "9:00 AM",
                "end_time": "9:50 AM"
            },
            {
                "day": "Friday",
                "start_time": "9:00 AM",
                "end_time": "9:50 AM"
            }
        ]
    },
    {
        "name": "MATH 0210",
        "department": "MATH",
        "course_number": "0210",
        "course_name": "Calculus I",
        "maximum_enrollment": 40,
        "seats_available": 10,
        "instructor": "Prof. John Doe",
        "description": "An introduction to differential and integral calculus of one variable, including limits, derivatives, and integrals.",
        "location": "Science Center 101",
        "schedule": [
            {
                "day": "Tuesday",
                "start_time": "11:00 AM",
                "end_time": "11:50 AM"
            },
            {
                "day": "Thursday",
                "start_time": "11:00 AM",
                "end_time": "11:50 AM"
            }
        ]
    }
]

The other will scrape https://bulletin.brown.edu/the-college/concentrations/ for formated concentration requirements. For right now i have those formatted as [
    {
        "name": "computer science",
        "degree_level": "Sc. B.",
        "requirements": [
            {
                "type": "prerequisites",
                "categories": [
                    {
                        "category_name": "Introductory Calculus",
                        "courses": [
                            {
                                "primary": ["MATH 0100"], 
                                "replacements": [
                                    ["MATH 0170"],
                                    ["MATH 0190"]
                                ]
                            }
                        ]
                    }
                ]
            },
            {
                "type": "Core-Computer Science",
                "categories": [
                    {
                        "category_name": "Select one of the following introductory course Series:",
                        "courses": [
                            {
                                "primary": ["CSCI 0150", "CSCI 0200"],
                                "replacements": [
                                    ["CSCI 0170", "CSCI 0200"],
                                    ["CSCI 0190", "an additional CS course numbered 200 or above not otherwise used to satisfy a concentration requirement; this course may be CSCI 0200, a Foundations course, or a 1000-level course."],
                                    ["CSCI 0110", "CSCI 0220"]
                                ]
                            }
                        ]
                    }
                ]
            }
        ]
    }
]"
```

```
"My scraped course data is messed up course codes are inconsistent and some fields are missing. how do I clean this up?"

"Im etting duplicate courses with different CRNs. Should I merge them or keep them separate for different sections?"

```

```
"I need to scrape degree requirements from brown bulletin. some pages are mostly words not structured. Im thinking of useing openai to parse the html?"

"Help me write a prompt for GPT to extract course requirements and return clean JSON data."
```


```
"I have my openai key in my .env but I think i need to add it to secrets in cloudflare workers"

```

```
"I need to create embeddings for course descriptions using clouflare vectorize."

"Should I embed just course descriptions or combine title description instructor info?"
```

```
"The AI responses are too wordy. How do I make them more concise"

"I want streaming for the chatbot so users see it typing in real-time."
```


```
"How do i setup the cloudflare workers and ai chatbot?"

```
```
"Some courses aren't showing up in search results."

```
```
"env variables aren't loading in production."

```

```
"Fix the ai chatbots frontend so it says what it can actually do instead of the default weather and appointments."

```


```
"Help me write a comprehensive README that explains what this project does and how it works."

"The readme needs to document the build process and deployment steps."

"add the production url to the top of the readme so its easily seen."

```

```
"I need all the AI prompts I used documented. Can you help me create a comprehensive PROMPTS.md file that includes both the system prompts in my code and examples of all the development questions I would have asked you while building this?"
```