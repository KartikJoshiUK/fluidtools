import FluidTools from "../langgraph/index.js";
import { ProviderConfig } from "../langgraph/types.js";
import { DEFAULT_SYSTEM_INSTRUCTIONS } from "./constants.js";

class FluidToolsClient {
  private clientSecret: string;
  private clientId: string;
  private toolsGenerator: (token?: string) => Record<string, any>;
  private config: ProviderConfig;
  private systemInstructions: string;

  constructor(
    clientId: string,
    clientSecret: string,
    config: ProviderConfig,
    toolsGenerator: (token?: string) => Record<string, any>,
    systemInstructions: string = ""
  ) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.toolsGenerator = toolsGenerator;
    this.config = config;
    this.systemInstructions = systemInstructions;
  }

  private getSystemInstructions = () => {
    return `
    - System Context: ${DEFAULT_SYSTEM_INSTRUCTIONS}
    ${
      this.systemInstructions
        ? `- System Instructions: ${this.systemInstructions}`
        : ""
    };`;
  };

  public async query(query: string, accessToken?: string) {
    const toolsByName = this.toolsGenerator(accessToken);
    const systemInstructions = this.getSystemInstructions();
    const fluidTool = new FluidTools(
      this.config,
      toolsByName,
      this.systemInstructions
    );
    const resopnse = await fluidTool.query(query);

    return resopnse.messages.at(-1)?.content;
  }
}

export default FluidToolsClient;
