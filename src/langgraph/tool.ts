import axios from "axios";
import { tool } from "langchain";
import z from "zod";

export class Tools {
  private toolsGenerator: (
    tool: any,
    schemaBuilder: any,
    axios: any,
    token?: string
  ) => Record<string, any>;
  private accessToken?: string;
  constructor(
    toolsGenerator: (
      tool: any,
      schemaBuilder: any,
      axios: any,
      token?: string
    ) => Record<string, any>
  ) {
    this.toolsGenerator = toolsGenerator;
  }

  public getToolByName() {
    return this.toolsGenerator(tool, z, axios, this.accessToken);
  }

  set AccessToken(token: string) {
    this.accessToken = token;
  }

  get AccessToken() {
    return this.accessToken ?? "NONE";
  }
}
