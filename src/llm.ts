
import { parseJsonResponse, PotentialError } from "./parsejson";

import * as fs from "fs/promises";
// import FunctionCall from "@google/genai";
import * as Gemini from "@google/generative-ai";
import {
  Part,
  FunctionCallPart,
  FunctionCall,
  FunctionResponsePart,
  Tool, // <-- Import Tool type here
  } from "@google/generative-ai";
  
  
console.log(Gemini);
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory, FunctionDeclarationSchema } from '@google/generative-ai';
import { FileChangeType } from "vscode";
// import { Part, FunctionCallPart, FunctionResponsePart } from '@google/generative-ai/dist/types/content';

const google_model = "gemini-2.0-flash";
const google_key = process.env.GOOGLE_API_KEY;

function extractJsonObject(text: string): string {
  const startMatch = text.match(/\{\s*"code"\s*:/);
  if (!startMatch) {
    throw new Error('Could not find JSON start (`{ "code"`) in model output.');
  }
  const startIdx = startMatch.index!;

  let braceCount = 0;
  let inString = false;
  let stringChar: "'" | '"' | null = null;
  let escapeNext = false;
  let endIdx = -1;

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escapeNext) {
        escapeNext = false;
      } else if (ch === "\\") {
        escapeNext = true;
      } else if (ch === stringChar) {
        inString = false;
        stringChar = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch as "'" | '"';
      continue;
    }

    if (ch === "{") {
      braceCount++;
    } else if (ch === "}") {
      braceCount--;
      if (braceCount === 0) {
        endIdx = i;
        break;
      }
    }
  }

  if (endIdx < 0) {
    throw new Error("Could not find matching closing brace for JSON object.");
  }

  return text.slice(startIdx, endIdx + 1);
}

export async function diffTranslate(
  baseContent: string,
  diffString: string,
  toCode: boolean,
  path: string
): Promise<{ code: string; potential_errors: PotentialError[] }> {
  //Promise<string> {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: google_key });

  const prompt = `
You are given:
- A diff:
${diffString}

- The original ${toCode ? "Python" : "Pseudocode"} file:
${baseContent}

Apply the changes logically and return updated code. Return **only** a valid JSON object with exactly these two keys:

{
  "code": "<updated ${toCode ? "" : "pseudo"} code>",
  "potential_errors": "e.g. changes you are with x might affect other files, such as: filepath!", 
}


The fullpath in the JSON should be the absolute path which you should guess based on the path to the file being edited is: ${path}
and this being the project tree structure:
├── blog.psu
├── blog.py
├── config.psu
├── config.py
├── main.psu
├── main.py
├── posts.json
├── __pycache__
│   ├── blog.cpython-310.pyc
│   ├── config.cpython-310.pyc
│   ├── storage.cpython-310.pyc
│   └── utils.cpython-310.pyc
├── storage.psu
├── storage.py
├── utils.psu
└── utils.py



Return **only** a JSON object. In particular, you must escape every double‐quote inside the code. For example, if your code says:

    print("Hello, world!")

you should output in JSON as:

    { "code": "print(\\"Hello, world!\\")", "potential_errors": [...] }

In other words, every \\\`"\` inside the \\\`"code"\` value must become \\\\\`\\\\\\"\\\`. 
Do not ever output an unescaped \\\`"\` inside the code string.
`;
console.log("Prompt for diffTranslate:", prompt);
const response = await ai.models.generateContent({
  model: google_model,
  contents: prompt,
});

const rawText = response.text?.trim() ?? "";
console.log("response from model in diffTranslate:", rawText);


try {
  let text = rawText
    .replace(/^\s*```(?:json)?\s*/, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let jsonString: string;
  try {
    jsonString = extractJsonObject(text);
  } catch (e) {
    throw new Error("Failed to extract JSON object from model output: " + (e instanceof Error ? e.message : String(e)));
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonString);
  } catch (firstError) {
    console.log("First parse attempt failed, trying to fix unescaped quotes…");

    jsonString = jsonString.replace(
      /"code":\s*"((?:[^"\\]|\\.)*)"/,
      (match, codeContent) => {
        const placeholder = "\uE000";
        const step1 = codeContent.replace(/\\\"/g, placeholder);
        const step2 = step1.replace(/"/g, '\\"');
        const escapedCode = step2.replace(new RegExp(placeholder, "g"), '\\"');
        return `"code": "${escapedCode}"`;
      }
    );

    try {
      parsed = JSON.parse(jsonString);
    } catch (secondError) {
      console.log("Second parse attempt failed, falling back to regex extraction…");

      const codeMatch = jsonString.match(/"code":\s*"((?:[^"\\]|\\.)*?)"/s);
      const errorsMatch = jsonString.match(/"potential_errors":\s*"([^"]*?)"/);

      if (!codeMatch) {
        throw new Error("Could not extract code field from malformed JSON.");
      }

      parsed = {
        code: codeMatch[1]
          .replace(/\\"/g, '"')
          .replace(/\\n/g, "\n")
          .replace(/\\\\/g, "\\"),
        potential_errors: errorsMatch ? errorsMatch[1] : "No potential errors."
      };
    }
  }

  if (typeof parsed.code !== "string") {
    throw new Error("❌ 'code' field is missing or not a string in parsed JSON.");
  }

  let errors: PotentialError[] = [];
  const rawErrors = parsed.potential_errors;
  if (Array.isArray(rawErrors)) {
    errors = rawErrors.map((e: any) => ({
      file: typeof e?.file === "string" ? e.file : "",
      message: typeof e?.message === "string" ? e.message : JSON.stringify(e),
    }));
  } else if (typeof rawErrors === "object" && rawErrors !== null) {
    errors = [
      {
        file: typeof rawErrors.file === "string" ? rawErrors.file : "",
        message: typeof rawErrors.message === "string" ? rawErrors.message : JSON.stringify(rawErrors),
      },
    ];
  } else if (typeof rawErrors === "string") {
    errors = [{ file: "", message: rawErrors }];
  }

  return {
    code: parsed.code,
    potential_errors: errors,
  };
} catch (err) {
  console.log("❌ Model response could not be parsed. See logs for details.", err);
  return {
    code: "",
    potential_errors: [
      {
        file: path,
        message: "Failed to parse model response. Check the input or model output.",
      },
    ],
  };
}
}




export async function translate(
  fileContent: string,
  toCode: boolean
): Promise<{ code: string; potential_errors: PotentialError[] }> {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: google_key });

  const prompt = `
You are an AI assistant converting code and analyzing it.
Return only valid JSON in this format:

{
  "code": "<the full generated code or description>",
  "potential_errors": ["List of potential issues, edge cases, or assumptions", "Another note"]
}

Here is the input:
---
${fileContent}
---

Direction: ${toCode ? "description → Python" : "Python → description"} 
${toCode ? "You are given a description of a code in a single file. You need to write the code that would do exactly what the description says. Do not write any other text than the code. It should be in python." : "You are supposed to write everything that the code you are given does so that a person given that description could replicate it. You do not need to explain the syntax and try to write it as simplistic as you can. Do not write any other text than the description. It should be in english. Do not explain each step and don't refernce the code. Instead just explain big picture what the code does with all details mentioned. Make sure to use new lines to make it readable."}

Do not include any markdown, comments, or natural language outside the JSON.
`;

  const response = await ai.models.generateContent({
    model: google_model,
    contents: prompt,
  });

  const rawText = response.text?.trim() ?? "";

  // Extract just the JSON (basic safe trim)
  const jsonStart = rawText.indexOf("{");
  const jsonEnd = rawText.lastIndexOf("}") + 1;
  const jsonString = rawText.slice(jsonStart, jsonEnd);

  try {
    const result = JSON.parse(jsonString);
    return {
      code: result.code ?? "",
      potential_errors: [] as PotentialError[]
    };
  } catch (e) {
    console.error("Invalid JSON from model:", rawText);
    throw new Error("Failed to parse model response.");
  }
}



const availableFunctions = {
  /**
   * Gets the full content of any file in the code base.
   * @param filepath The file path to the file that is to be retrieved.
   */
  readfile: async (filepath: string): Promise<any> => {
    console.log(`[Tool Call] reading file for: ${filepath}`);
    // In a real application, you'd call an external API here
    // const filePath = filepath.args?.path as string;
      if (filepath) {
        try {
          const fileContent = await fs.readFile(filepath, "utf8");
          // You can process the file content here or make another API call
          console.log(`successfully Read file: ${filepath}`);
          if (fileContent === "") {
            return { content: ""}
            // return { success: false, message: "empty" };
          }
          return { content: fileContent}
          // return { success: true, message: fileContent };
        } catch (error) {
          console.error(`Error reading file ${filepath}:`, error);
          return { content: "FAILURE"}
          // success: false, message: "empty" };
        }
      }
  },
}



const toolDeclarations: Tool[] = [ // Explicitly type as Tool[]
  {
    functionDeclarations: [ // This should be an array of function declarations
      {
        name: "readfile",
        description:
          "Gets the full content of any file in the code base. Use this to read files by their absolute path.",
        parameters: {
          type: "object",
          properties: {
            filepath: {
              type: "string",
              description: "The absolute file path to the file you want to read.",
            },
          },
          required: ["filepath"],
        } as FunctionDeclarationSchema,
      },
    ],
  },
];


export async function diffTranslatewithTool(
  baseContent: string,
  diffString: string,
  toCode: boolean
): Promise<string> {

  const ai = new GoogleGenerativeAI(google_key || "");
  const model = ai.getGenerativeModel({
    model: google_model,
    // Add tools here directly when initializing the model for single-turn or simple requests
    // For multi-turn chats, it's often more practical to set tools in startChat
  });
  const chat = model.startChat({
    tools: toolDeclarations,
    // You can also add history here if needed for continuous conversations
    // history: [],
  });
 


  let firstprompt: string;
  let response = "";
  if (toCode) {
    firstprompt = `
    PLEASE CALL THE 'readfile' tool to read the following file: /home/oliverz/Documents/IMAI/pseudo/test2/blog_demo/main.py  and then return what you read in the file.
    `;


    console.log("Prompt for fHJWFHWJEdiffTranslate:", firstprompt);

    let currentModelResult = await chat.sendMessage(firstprompt);
    let responseText = "";
    
    while (true) {
      const response = await currentModelResult.response;
      const callParts = response.candidates?.[0]?.content?.parts;
      console.log("firs trresponse diffTranslate:", response.text());

      if (!callParts || callParts.length === 0) {
        responseText = response.text() || "";
        console.log("exited without toool calling:", responseText);

        return responseText.replace(/```(?:[a-z]*)\n?|\n?```/g, "").trim();;
      } else {
        console.log(`DEFINITIVE callParts.length: ${callParts.length}`);
        console.log("DEFINITIVE callParts content:", JSON.stringify(callParts, null, 2));
        // break; // No more tool calls or text response
      }

      let hasFunctionCall = false;
      const toolResponses: Part[] = [];

      console.log("the callparts are:", callParts);

      for (const parties of callParts) {
        console.log("QUICKLOOP through callParts :", parties);
      }

      
      for (const part of callParts) {
        console.log("loopingt through callParts :", part);

        if (part.functionCall) {
          console.log("inside the part functioncall:", part.functionCall);

          hasFunctionCall = true;
          const functionCall = part.functionCall as FunctionCall; //Part;
          const functionName = functionCall.name;
          const functionArgs = functionCall.args;

          console.log(`Model requested tool: ${functionName} with args:`, functionArgs);

          
          if (functionName in availableFunctions) {
            try {
              const { filepath } = functionArgs as { filepath: string };
              const toolOutput = await availableFunctions[functionName as keyof typeof availableFunctions](filepath);
              // const toolOutput = await availableFunctions[
              //   functionName as keyof typeof availableFunctions
              // ](functionArgs.filepath as string); // Cast to string if 'filepath' is always expected
              console.log("Tool output:", toolOutput);

              toolResponses.push({
                functionResponse: {
                  name: functionName,
                  response: toolOutput,
                },
              } as FunctionResponsePart);
            } catch (error: any) {
              console.error(`Error executing tool ${functionName}:`, error);
              toolResponses.push({
                functionResponse: {
                  name: functionName,
                  response: { error: error.message || "Tool execution failed." },
                },
              } as FunctionResponsePart);
            }
          } else {
            console.warn(`Model requested unknown tool: ${functionName}`);
            toolResponses.push({
              functionResponse: {
                name: functionName,
                response: { error: `Unknown tool: ${functionName}` },
              },
            } as FunctionResponsePart);
          }
        } else if (part.text) {
          console.log("in else.");

          // If the model also provides text, capture it
          responseText += part.text;
        }
      }

      if (hasFunctionCall && toolResponses.length > 0) {
        const modelSentCalls = callParts.filter(p => !!p.functionCall).length;
        console.log(`Model sent ${modelSentCalls} calls. We prepared ${toolResponses.length} responses.`);
 
        console.log("went into hasfunctionall :", toolResponses);

        // Send the tool outputs back to the model
        console.log("Tool responses sent back to model:", toolResponses);
        let currentModelResult = await chat.sendMessage(toolResponses);
      } else {
        console.log("No function calls detected, exiting loop.");
        return responseText.replace(/```(?:[a-z]*)\n?|\n?```/g, "").trim();;

        // If there were no function calls, or no more, we're done
        break;
      }
    }
    const cleanedText = responseText.replace(/```(?:[a-z]*)\n?|\n?```/g, "").trim();
    return cleanedText;
  }
  else {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: google_key });


  let promptt: string;
  // We have a diff of Python code changes, apply to pseudocode
  promptt = `
You are given:
1) A unified diff showing how the Python (.py) file changed:
---
${diffString}
---
2) The original pseudocode that corresponds to the old Python code:
---
${baseContent}
---
Please apply the same logical changes to the pseudocode. Output only the full, updated pseudocode, with no explanations or markdown.`;
  

  console.log("Prompt for NOOOOOdiffTranslate:", promptt);
  const response = await ai.models.generateContent({
    model: google_model,
    contents: promptt,
  });
  

  const text = response.text ?? "";
  // strip any accidental backticks, trim whitespace
  return text.replace(/```(?:[a-z]*)\n?|\n?```/g, "").trim();
  }
}
