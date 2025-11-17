import { PostmanRequest } from "./types.js";

/**
 * Flatten Postman collection recursively
 */
export function flattenPostmanCollection(collection: any): PostmanRequest[] {
  const result: PostmanRequest[] = [];

  function recurse(items: any[]) {
    for (const item of items) {
      if (item.item && Array.isArray(item.item)) {
        recurse(item.item);
      } else if (item.request) {
        result.push(item);
      }
    }
  }

  recurse(collection.item || []);
  return result;
}

/**
 * Extract query parameters from Postman request
 */
function extractQueryParams(
  request: PostmanRequest
): Array<{ key: string; description: string }> {
  const queryParams: Array<{ key: string; description: string }> = [];

  // Check if URL has query array
  if (request.request.url && typeof request.request.url === "object") {
    const urlObj = request.request.url as any;
    if (urlObj.query && Array.isArray(urlObj.query)) {
      for (const param of urlObj.query) {
        queryParams.push({
          key: param.key,
          description: param.description || `${param.key} parameter`,
        });
      }
    }
  }

  return queryParams;
}

/**
 * Generate LangChain-compatible Zod schema code as a string
 * This returns TypeScript code that can be used with LangChain's tool() function
 */
export function postmanToLangChainCode(collection: any): string {
  const requests = flattenPostmanCollection(collection);

  let code = `import { z } from 'zod';\nimport { tool } from 'langchain';\nimport axios from 'axios';\n\n`;
  code += `// Generated LangChain tools from Postman collection\n\n`;
  code += `export function generateTools(authToken?: string) {\n`;
  code += `  const tools: Record<string, any> = {};\n\n`;

  for (const request of requests) {
    const name = request.name.replace(/\s+/g, "_").toLowerCase();
    const method = request.request.method || "GET";
    const url = request.request.url?.raw || "";
    const description = `${method} request to ${url}`;
    const queryParams = extractQueryParams(request);

    code += `  // ${request.name}\n`;
    code += `  const ${name} = tool(\n`;
    code += `    async (args: any) => {\n`;
    code += `      try {\n`;

    if (method === "GET") {
      // Build URL with query parameters if provided
      if (queryParams.length > 0) {
        code += `        let url = '${url}';\n`;
        code += `        const params = new URLSearchParams();\n`;
        for (const param of queryParams) {
          code += `        if (args.${param.key}) params.append('${param.key}', args.${param.key});\n`;
        }
        code += `        if (params.toString()) url += (url.includes('?') ? '&' : '?') + params.toString();\n`;
        code += `        const res = await axios.get(url, {\n`;
      } else {
        code += `        const res = await axios.get('${url}', {\n`;
      }
      code += `          headers: authToken ? { 'Authorization': \`Bearer \${authToken}\` } : {},\n`;
      code += `        });\n`;
    } else if (method === "POST" || method === "PUT") {
      code += `        const res = await axios.${method.toLowerCase()}('${url}', args.body || {}, {\n`;
      code += `          headers: authToken ? { 'Authorization': \`Bearer \${authToken}\` } : {},\n`;
      code += `        });\n`;
    }

    code += `        return JSON.stringify(res.data, null, 2);\n`;
    code += `      } catch (err: any) {\n`;
    code += `        console.log("🚨 API ERROR");\n`;
    code += `        return \`Error: \${err.message}\`;\n`;
    code += `      }\n`;
    code += `    },\n`;
    code += `    {\n`;
    code += `      name: '${name}',\n`;
    code += `      description: '${description}',\n`;
    code += `      schema: z.object({\n`;

    // Add query parameters as individual fields
    if (method === "GET" && queryParams.length > 0) {
      for (const param of queryParams) {
        code += `        ${param.key}: z.string().optional().describe('${param.description}'),\n`;
      }
    } else if (method === "GET") {
      code += `        query: z.string().optional(),\n`;
    }

    if (method === "POST" || method === "PUT") {
      code += `        body: z.any().optional(),\n`;
    }

    code += `      }),\n`;
    code += `    }\n`;
    code += `  );\n`;
    code += `  tools["${name}"] = (${name});\n\n`;
  }

  code += `  return tools;\n`;
  code += `}\n`;

  return code;
}
