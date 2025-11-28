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
    return this.toolsGenerator(tool, z, axios, debug);
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
