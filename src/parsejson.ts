export type PotentialError = {
    file: string;
    message: string;
  };
  
  type ModelResponse = {
    code: string;
    potential_errors: PotentialError[];
  };
  
  export function parseJsonResponse(rawText: string): ModelResponse {
    console.log("🔍 Raw model response:\n", rawText);
  
    // 1) Remove any ``` fences at top or bottom
    let text = rawText.trim();
    // remove leading ``` or ```json
    text = text.replace(/^\s*```(?:json)?\s*\n?/, "");
    // remove trailing ```
    text = text.replace(/\n?```\s*$/, "");
    console.log("✂️ After stripping fences:\n", text);
  
    // 2) Extract the outermost JSON object by counting braces, ignoring ones inside strings
    const startIdx = text.indexOf("{");
    if (startIdx < 0) {
      console.error("❌ No '{' found at all in cleaned response.");
      throw new Error("Failed to find JSON object in response.");
    }
  
    let inString = false;
    let escapeNext = false;
    let braceCount = 0;
    let endIdx = -1;
  
    for (let i = startIdx; i < text.length; i++) {
      const ch = text[i];
  
      if (escapeNext) {
        escapeNext = false;
      } else if (ch === "\\") {
        escapeNext = true;
      } else if (ch === '"' ) {
        inString = !inString;
      } else if (!inString) {
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
    }
  
    if (endIdx < 0) {
      console.error("❌ Never closed the JSON object (unbalanced braces).");
      throw new Error("Failed to extract a balanced JSON block.");
    }
  
    const jsonString = text.slice(startIdx, endIdx + 1);
    console.log("📦 Extracted JSON string:\n", jsonString);
  
    // 3) Parse it
    let parsed: any;
    try {
      parsed = JSON.parse(jsonString);
    } catch (e) {
      console.error("❌ JSON.parse failed:", e);
      throw new Error("Failed to parse JSON: " + (e as Error).message);
    }
  
    // 4) Validate shape
    if (
      typeof parsed !== "object" ||
      typeof parsed.code !== "string" ||
      !Array.isArray(parsed.potential_errors)
    ) {
      console.error("❌ Parsed JSON has the wrong shape:", parsed);
      throw new Error("Parsed JSON does not have { code: string; potential_errors: any[] }");
    }
  
    // 5) Normalize potential_errors
    const potential_errors: PotentialError[] = parsed.potential_errors.map((err: any) => {
      if (typeof err === "string") {
        return { file: "", message: err };
      }
      return {
        file: typeof err.file === "string" ? err.file : "",
        message: typeof err.message === "string" ? err.message : JSON.stringify(err),
      };
    });
  
    return {
      code: parsed.code,
      potential_errors,
    };
  }
  