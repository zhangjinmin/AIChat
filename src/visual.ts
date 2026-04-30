"use strict";

import powerbi from "powerbi-visuals-api";
import "./../style/visual.less";
import * as React from "react";
// @ts-ignore
import { createRoot } from "react-dom/client"; 
import { ChatApp, ChatProps, QuickCommand } from "./component";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import VisualObjectInstance = powerbi.VisualObjectInstance;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.extensibility.ISelectionId;

export class Visual implements IVisual {
    private target: HTMLElement;
    private reactRoot: HTMLElement;
    private root: any = null;
    
    private host: powerbi.extensibility.visual.IVisualHost;
    private selectionManager: ISelectionManager;
    private currentActiveFilter: string | null = null;

    private cachedBaseSystemPromptString: string = "";
    private cachedCustomSystemPromptString: string = "";
    private cachedInstructionsString: string = "";
    private cachedGrandTotalTextString: string = ""; // 🌟 新增：大盘总计播报缓存
    private cachedQuickCommandsList: QuickCommand[] = [];
    private cachedGlobalConfig: any = null; 
    private cachedFilterMap: { [key: string]: ISelectionId[] } = {};
    
    private cachedRawData: any[] = [];
    private cachedDimCols: string[] = [];
    private cachedMetricCols: string[] = [];
    private cachedBlacklistCols: string[] = []; 

    private settings = {
        aiConfig: {
            baseUrl: "https://api.longcat.chat/openai/v1", 
            apiKey: "",
            modelName: "LongCat-Flash-Chat"
        },
        uiConfig: {
            botName: "分析助手",
            themeColor: "#0F62FE",
            showAutoInsight: true,
            autoInsightName: "自动洞察",
            autoInsightPrompt: "请对当前的业务数据进行全面洞察，指出核心指标的变化趋势、异常值，并给出业务建议。"
        },
        moduleSettings: {
            enableDataInsight: true,
            enableDaxCopilot: true,
            enableDebugMode: false,
            defaultPrivacyMode: "semi_text",
            allowInteractiveDims: true, 
            restrictDomain: true
        }
    };

    constructor(options: VisualConstructorOptions) {
        this.target = options.element;
        this.host = options.host;
        this.selectionManager = this.host.createSelectionManager();
        
        this.reactRoot = document.createElement("div");
        this.reactRoot.className = "react-root";
        this.reactRoot.style.width = "100%";
        this.reactRoot.style.height = "100%";
        this.reactRoot.style.overflow = "hidden";
        this.target.appendChild(this.reactRoot);
    }

    public update(options: VisualUpdateOptions) {
        try {
            if (options.dataViews && options.dataViews.length > 0 && options.dataViews[0].metadata && options.dataViews[0].metadata.segment) {
                const isFetching = this.host.fetchMoreData();
                if (isFetching) {
                    return; 
                }
            }

            let isDataUpdate = true;
            if (options.type !== undefined) {
                isDataUpdate = (options.type & powerbi.VisualUpdateType.Data) === powerbi.VisualUpdateType.Data;
            }

            if (options.dataViews && options.dataViews.length > 0) {
                const dataView = options.dataViews[0];
                this.parseSettings(dataView);

                if (isDataUpdate || this.cachedRawData.length === 0) {
                    
                    this.cachedFilterMap = {};
                    this.cachedQuickCommandsList = [];
                    this.cachedCustomSystemPromptString = "";
                    this.cachedInstructionsString = "";
                    this.cachedGrandTotalTextString = ""; // 🌟 重置缓存
                    this.cachedGlobalConfig = null; 
                    this.cachedRawData = [];
                    this.cachedDimCols = [];
                    this.cachedMetricCols = [];
                    this.cachedBlacklistCols = [];
                    
                    this.cachedBaseSystemPromptString = `你是一位专业的数据分析专家。请根据提供的业务数据回答问题。

【图表生成专家系统 - 智能选择引擎】
当你需要渲染图表时，请严格遵守以下 JSON 格式并包裹在 \`\`\`chart 代码块中。
你必须基于业务数据的特性和用户的分析意图，智能且精准地选择最合适的图表类型 (chartType)：
1. 结构/占比分析 (如各品类销售占比)：使用 "pie" (圆环图)。
2. 时间连续趋势 (如按月/周走势)：使用 "area" (面积图) 或 "composed" 里的 line。
3. 排行榜或长名称对比 (如Top10门店、具体商品排行)：强烈推荐使用 "horizontalBar" (横向条形图，极度适合名称较长的维度，避免X轴文字拥挤)。
4. 多维特征/能力评估 (如分析单店的各项KPI指标综合表现)：强烈推荐使用 "radar" (雷达图，非常适合诊断)。
5. 多指标双轴对比 (如销售额与同比增速)：使用 "composed" (组合图)，显式配置 series 的 type 为 bar 或 line，并可设置 yAxis: "right"。

🚨 JSON 严格规范 (极度重要)：
1. 必须包含 "data" 数组，把你计算出的实际数据对象完整填入其中！绝对不能留空！
2. 代码块的语言声明必须是 \`\`\`chart （绝不能写成 \`\`\`json）！
3. 绝不可以有任何 // 注释 或 多余的逗号！必须是标准 JSON！
4. X轴键名强制使用 "name"，数值键名强制使用 "value"。所有字符串必须使用双引号！

【重点指令：深度联动筛选】
当需要联动过滤时，插入行内代码 \`filter:条件\`。跨维度(且)用【空格】，同维度(或)用【逗号】。`;

                    if (dataView.table && dataView.table.rows && dataView.table.columns) {
                        const columns = dataView.table.columns;
                        const rows = dataView.table.rows;

                        let promptColIndices: number[] = [];
                        let quickCommandIndices: number[] = [];
                        let instructionsColIndices: number[] = [];
                        let grandTotalColIndices: number[] = []; // 🌟 新增：捕获大盘总计
                        let globalConfigColIndex: number = -1; 
                        
                        let dimIndices: number[] = [];
                        let metricIndices: number[] = [];
                        let blacklistIndices: number[] = [];

                        columns.forEach((col, index) => {
                            if (col.roles) {
                                if (col.roles["systemPrompt"]) promptColIndices.push(index);
                                if (col.roles["quickCommands"]) quickCommandIndices.push(index);
                                if (col.roles["instructions"]) instructionsColIndices.push(index);
                                if (col.roles["grandTotalText"]) grandTotalColIndices.push(index); // 🌟 捕获
                                if (col.roles["globalConfig"]) globalConfigColIndex = index; 
                                if (col.roles["dimensions"]) { dimIndices.push(index); this.cachedDimCols.push(col.displayName); }
                                if (col.roles["metrics"]) { metricIndices.push(index); this.cachedMetricCols.push(col.displayName); }
                                if (col.roles["privacyBlacklist"]) {
                                    blacklistIndices.push(index);
                                    this.cachedBlacklistCols.push(col.displayName);
                                }
                            }
                        });

                        if (globalConfigColIndex !== -1 && rows.length > 0) {
                            const val = rows[0][globalConfigColIndex];
                            if (val !== null && val !== undefined) {
                                try { this.cachedGlobalConfig = JSON.parse(val.toString()); } 
                                catch (e) { console.warn("全局配置解析失败", e); }
                            }
                        }

                        if (instructionsColIndices.length > 0 && rows.length > 0) {
                            instructionsColIndices.forEach(idx => {
                                const val = rows[0][idx];
                                if (val !== null && val !== undefined) {
                                    this.cachedInstructionsString = val.toString();
                                }
                            });
                        }

                        // 🌟 提取大盘总计播报文本
                        if (grandTotalColIndices.length > 0 && rows.length > 0) {
                            const val = rows[0][grandTotalColIndices[0]];
                            if (val !== null && val !== undefined) {
                                this.cachedGrandTotalTextString = val.toString();
                            }
                        }

                        if (promptColIndices.length > 0 && rows.length > 0) {
                            let combinedCustomPrompts: string[] = [];
                            promptColIndices.forEach(idx => {
                                const promptVal = rows[0][idx];
                                const promptName = columns[idx].displayName;
                                if (promptVal !== null && promptVal !== undefined) {
                                    combinedCustomPrompts.push(`### 【用户自定义业务分析规则：${promptName}】\n${promptVal.toString()}`);
                                }
                            });
                            if (combinedCustomPrompts.length > 0) {
                                this.cachedCustomSystemPromptString = combinedCustomPrompts.join("\n\n");
                            }
                        }

                        if (quickCommandIndices.length > 0 && rows.length > 0) {
                            quickCommandIndices.forEach(idx => {
                                const cmdName = columns[idx].displayName;
                                const cmdPrompt = rows[0][idx];
                                if (cmdPrompt !== null && cmdPrompt !== undefined) {
                                    this.cachedQuickCommandsList.push({ name: cmdName, prompt: cmdPrompt.toString() });
                                }
                            });
                        }

                        if ((dimIndices.length > 0 || metricIndices.length > 0) && rows.length > 0) {
                            rows.forEach((row, rowIndex) => {
                                let rowSelectionId: ISelectionId = null;
                                try {
                                    rowSelectionId = this.host.createSelectionIdBuilder().withTable(dataView.table, rowIndex).createSelectionId();
                                } catch (e) {}

                                let rowObj: any = {};
                                
                                dimIndices.forEach(idx => {
                                    const colName = columns[idx].displayName;
                                    const val = row[idx];
                                    const strVal = val !== null && val !== undefined ? val.toString().trim() : "(空)";
                                    rowObj[colName] = strVal;

                                    if (rowSelectionId && strVal !== "(空)") {
                                        if (!this.cachedFilterMap[strVal]) this.cachedFilterMap[strVal] = [];
                                        this.cachedFilterMap[strVal].push(rowSelectionId);
                                    }
                                });

                                metricIndices.forEach(idx => {
                                    const colName = columns[idx].displayName;
                                    const val = row[idx];
                                    rowObj[colName] = val !== null && val !== undefined ? Number(val) : 0;
                                });

                                blacklistIndices.forEach(idx => {
                                    const colName = columns[idx].displayName;
                                    if (rowObj[colName] === undefined) {
                                        const val = row[idx];
                                        rowObj[colName] = val !== null && val !== undefined ? val.toString().trim() : "(空)";
                                    }
                                });

                                this.cachedRawData.push(rowObj);
                            });
                        }
                    }
                }
            }

            const handleFilter = (filterName: string) => {
                const trimmedName = filterName.trim();
                const andGroups = trimmedName.split(/\s+/).filter(t => t.length > 0);
                if (andGroups.length === 0) return;

                let finalIds: ISelectionId[] = null;

                for (let i = 0; i < andGroups.length; i++) {
                    const groupStr = andGroups[i];
                    const orTerms = groupStr.split(/[,，\+＋\|]+/).filter(t => t.length > 0);

                    let groupIds: ISelectionId[] = [];
                    orTerms.forEach(term => {
                        const termIds = this.cachedFilterMap[term] || [];
                        groupIds = [...groupIds, ...termIds];
                    });

                    if (finalIds === null) {
                        finalIds = groupIds;
                    } else {
                        finalIds = finalIds.filter(id1 => groupIds.some(id2 => ((id2 as any).equals(id1))));
                    }
                }

                if (finalIds && finalIds.length === 0 && andGroups.length > 1) {
                    finalIds = [];
                    const allTerms = trimmedName.split(/[\s,，\+＋\|]+/).filter(t => t.length > 0);
                    allTerms.forEach(term => {
                        const termIds = this.cachedFilterMap[term] || [];
                        finalIds = [...finalIds, ...termIds];
                    });
                }

                if (finalIds && finalIds.length > 0) {
                    if (this.currentActiveFilter === trimmedName) {
                        this.selectionManager.clear().then(() => { this.currentActiveFilter = null; });
                    } else {
                        this.selectionManager.select(finalIds, false).then(() => { this.currentActiveFilter = trimmedName; });
                    }
                }
            };

            const activeBaseUrl = (this.cachedGlobalConfig && this.cachedGlobalConfig.baseUrl) || this.settings.aiConfig.baseUrl;
            const activeApiKey = (this.cachedGlobalConfig && this.cachedGlobalConfig.apiKey) || this.settings.aiConfig.apiKey;
            const activeModelName = (this.cachedGlobalConfig && this.cachedGlobalConfig.modelName) || this.settings.aiConfig.modelName;

            const props: ChatProps = {
                baseSystemPrompt: this.cachedBaseSystemPromptString,
                customSystemPrompt: this.cachedCustomSystemPromptString,
                grandTotalText: this.cachedGrandTotalTextString, // 🌟 传递给React组件
                
                rawTableData: this.cachedRawData,
                dimensionCols: this.cachedDimCols,
                metricCols: this.cachedMetricCols,
                blacklistCols: this.cachedBlacklistCols, 
                
                quickCommands: this.cachedQuickCommandsList,
                instructions: this.cachedInstructionsString, // 🌟 确保此处安全传递
                
                baseUrl: activeBaseUrl,
                apiKey: activeApiKey,
                modelName: activeModelName,
                botName: this.settings.uiConfig.botName,
                themeColor: this.settings.uiConfig.themeColor,
                showAutoInsight: this.settings.uiConfig.showAutoInsight,
                autoInsightName: this.settings.uiConfig.autoInsightName,
                autoInsightPrompt: this.settings.uiConfig.autoInsightPrompt,
                onFilter: handleFilter,
                enableDataInsight: this.settings.moduleSettings.enableDataInsight,
                enableDaxCopilot: this.settings.moduleSettings.enableDaxCopilot,
                enableDebugMode: this.settings.moduleSettings.enableDebugMode,
                defaultPrivacyMode: this.settings.moduleSettings.defaultPrivacyMode as any,
                allowInteractiveDims: this.settings.moduleSettings.allowInteractiveDims, 
                restrictDomain: this.settings.moduleSettings.restrictDomain
            };

            if (!this.root) this.root = createRoot(this.reactRoot);
            this.root.render(React.createElement(ChatApp, props));

        } catch (error) {
            this.reactRoot.innerHTML = `<div style="padding:20px;color:red;"><h3>⚠️ 渲染错误</h3><p>${error.message}</p></div>`;
        }
    }

    public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstance[] {
        const objectName = options.objectName;
        const instances: VisualObjectInstance[] = [];

        if (objectName === 'aiConfig') instances.push({ objectName, properties: this.settings.aiConfig, selector: null });
        else if (objectName === 'uiConfig') instances.push({ objectName, properties: this.settings.uiConfig, selector: null });
        else if (objectName === 'moduleSettings') instances.push({ objectName, properties: this.settings.moduleSettings, selector: null });
        
        return instances;
    }

    private parseSettings(dataView: powerbi.DataView) {
        const metadata = dataView.metadata;
        if (!metadata || !metadata.objects) return;
        const objects = metadata.objects;
        
        if (objects.aiConfig) {
            const o = objects.aiConfig as any;
            if (o.baseUrl !== undefined) this.settings.aiConfig.baseUrl = String(o.baseUrl);
            if (o.apiKey !== undefined) this.settings.aiConfig.apiKey = String(o.apiKey);
            if (o.modelName !== undefined) this.settings.aiConfig.modelName = String(o.modelName);
        }
        if (objects.uiConfig) {
            const o = objects.uiConfig as any;
            if (o.botName !== undefined) this.settings.uiConfig.botName = String(o.botName);
            if (o.themeColor && o.themeColor.solid) this.settings.uiConfig.themeColor = o.themeColor.solid.color;
            if (o.showAutoInsight !== undefined) this.settings.uiConfig.showAutoInsight = Boolean(o.showAutoInsight);
            if (o.autoInsightName !== undefined) this.settings.uiConfig.autoInsightName = String(o.autoInsightName);
            if (o.autoInsightPrompt !== undefined) this.settings.uiConfig.autoInsightPrompt = String(o.autoInsightPrompt);
        }
        if (objects.moduleSettings) {
            const o = objects.moduleSettings as any;
            if (o.enableDataInsight !== undefined) this.settings.moduleSettings.enableDataInsight = Boolean(o.enableDataInsight);
            if (o.enableDaxCopilot !== undefined) this.settings.moduleSettings.enableDaxCopilot = Boolean(o.enableDaxCopilot);
            if (o.enableDebugMode !== undefined) this.settings.moduleSettings.enableDebugMode = Boolean(o.enableDebugMode);
            if (o.defaultPrivacyMode !== undefined) this.settings.moduleSettings.defaultPrivacyMode = String(o.defaultPrivacyMode);
            if (o.allowInteractiveDims !== undefined) this.settings.moduleSettings.allowInteractiveDims = Boolean(o.allowInteractiveDims);
            if (o.restrictDomain !== undefined) this.settings.moduleSettings.restrictDomain = Boolean(o.restrictDomain);
        }
    }
}