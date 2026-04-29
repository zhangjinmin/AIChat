import * as React from "react";
export interface QuickCommand {
    name: string;
    prompt: string;
}
export interface ChatProps {
    baseSystemPrompt: string;
    customSystemPrompt: string;
    businessData: string;
    quickCommands: QuickCommand[];
    instructions?: string;
    baseUrl: string;
    apiKey: string;
    modelName: string;
    botName: string;
    themeColor: string;
    showAutoInsight: boolean;
    autoInsightName: string;
    autoInsightPrompt: string;
    onFilter?: (filterName: string) => void;
    enableDataInsight?: boolean;
    enableDaxCopilot?: boolean;
    enableDebugMode?: boolean;
    defaultPrivacyMode: "off" | "semi_text" | "full_text" | "strict";
    restrictDomain?: boolean;
}
export declare const ChatApp: React.FC<ChatProps>;
