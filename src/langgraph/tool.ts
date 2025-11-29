import axios from "axios";
import { tool } from "langchain";
import z from "zod";

export class Tools {
  private toolsGenerator: (
    tool: any,
    schemaBuilder: any,
    axios: any,
    debug?: boolean
  ) => Record<string, any>;
  private toolConfig: Record<string, any> = {};
  private accessToken?: string;
  private filteredToolNames?: string[];

  constructor(
    toolsGenerator: (
      tool: any,
      schemaBuilder: any,
      axios: any,
      debug?: boolean
    ) => Record<string, any>,
    toolsConfig?: Record<string, any>,
    debug?: boolean
  ) {
    this.toolsGenerator = toolsGenerator;
    if (toolsConfig) this.toolConfig = toolsConfig;
  }

  public getToolByName(debug?: boolean) {
    const allTools = this.toolsGenerator(tool, z, axios, debug);

    // If no filter is set, return all tools
    if (!this.filteredToolNames || this.filteredToolNames.length === 0) {
      return allTools;
    }

    // Filter tools to only include selected names
    const filteredTools: Record<string, any> = {};
    for (const name of this.filteredToolNames) {
      if (allTools[name]) {
        filteredTools[name] = allTools[name];
      }
    }

    // If no tools match, return all tools as fallback (Requirement 7.2)
    if (Object.keys(filteredTools).length === 0) {
      console.warn(
        `⚠️ [Tools.getToolByName] No tools matched filter, returning all tools as fallback`
      );
      return allTools;
    }

    return filteredTools;
  }

  /**
   * Filter tools to only include specified names
   * Implements Requirement 7.2: Filter tool dictionary to only include selected tools
   * 
   * @param names - Array of tool names to include
   */
  public filterToNames(names: string[]): void {
    this.filteredToolNames = names;
  }

  /**
   * Clear any tool name filters
   */
  public clearFilter(): void {
    this.filteredToolNames = undefined;
  }

  set AccessToken(token: string) {
    this.accessToken = token;
  }

  get AccessToken() {
    return this.accessToken ?? "NONE";
  }

  get Config() {
    return this.toolConfig;
  }
}
