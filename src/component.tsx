import * as React from "react";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
// @ts-ignore
import ReactMarkdown from "react-markdown";
import { 
    ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, AreaChart, Area,
    RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

export interface QuickCommand { name: string; prompt: string; }

export interface ChatProps {
    baseSystemPrompt: string; customSystemPrompt: string; 
    grandTotalText?: string; 
    rawTableData: any[]; dimensionCols: string[]; metricCols: string[]; blacklistCols: string[];
    quickCommands: QuickCommand[];
    instructions?: string; 
    baseUrl: string; apiKey: string; modelName: string; 
    botName: string; themeColor: string; showAutoInsight: boolean;
    autoInsightName: string; autoInsightPrompt: string;
    onFilter?: (filterName: string) => void;
    enableDataInsight?: boolean; 
    enableDaxCopilot?: boolean;
    enableDebugMode?: boolean;
    defaultPrivacyMode: "off" | "semi_text" | "full_text" | "strict";
    allowInteractiveDims: boolean;
    disableAggregation?: boolean; // 🌟 接收是否禁用聚合的指令
    restrictDomain?: boolean;
}

interface Message { role: "user" | "assistant" | "error" | "system_warning" | "system_info"; content: string; }

class MessageErrorBoundary extends React.Component<{children: React.ReactNode, rawContent: string}, {hasError: boolean, errorMsg: string}> {
    constructor(props: any) { super(props); this.state = { hasError: false, errorMsg: "" }; }
    static getDerivedStateFromError(error: any) { return { hasError: true, errorMsg: error.toString() }; }
    componentDidCatch(error: any, errorInfo: any) { console.error("消息渲染被拦截:", error); }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{padding: '12px', color: '#ef4444', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', fontSize: '12px', lineHeight: 1.5}}>
                    <b style={{display: 'flex', alignItems: 'center', gap: '5px'}}>渲染引擎保护 <span style={{fontSize:'10px', fontWeight:'normal', color: '#b91c1c'}}>(降级为纯文本)</span></b>
                    <div style={{ whiteSpace: 'pre-wrap', marginTop: '10px', color: '#334155', fontFamily: 'Consolas, monospace', backgroundColor: '#fff', padding: '10px', borderRadius: '4px', border: '1px solid #f87171', overflowX: 'auto' }}>
                        {this.props.rawContent}
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

const ThinkingAnimation = ({ themeColor }: { themeColor: string }) => {
    const [dots, setDots] = useState("");
    useEffect(() => {
        const interval = setInterval(() => { setDots(prev => prev.length >= 10 ? "" : prev + "."); }, 150); 
        return () => clearInterval(interval);
    }, []);
    return (
        <span style={{ color: themeColor, fontWeight: 'bold', fontSize: '14px', letterSpacing: '2px', fontFamily: 'monospace' }}>
            深度分析与图表生成中 {dots}
        </span>
    );
};

const transformTablesToCodeBlocks = (text: string) => {
    if (!text) return text;
    const lines = text.split('\n');
    let inTable = false;
    let result = [];
    let tableBuffer = [];
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed.startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            if (inTable) { result.push('```table\n' + tableBuffer.join('\n') + '\n```'); tableBuffer = []; inTable = false; }
            result.push(line);
            continue;
        }
        if (inCodeBlock) { result.push(line); continue; }

        if (trimmed.startsWith('|')) {
            inTable = true;
            tableBuffer.push(line);
        } else {
            if (inTable) { result.push('```table\n' + tableBuffer.join('\n') + '\n```'); tableBuffer = []; inTable = false; }
            result.push(line);
        }
    }
    if (inTable) result.push('```table\n' + tableBuffer.join('\n') + '\n```');
    return result.join('\n');
};

const processThinkTags = (text: string) => {
    if (!text) return text;
    return text
        .replace(/<think>/g, '\n<details style="background:#f8fafc; border:1px solid #cbd5e1; padding:10px; border-radius:8px; margin-bottom:15px; font-size:12px; color:#64748b;"><summary style="cursor:pointer; font-weight:bold; color:#475569;">AI 思考过程 (点击展开)</summary>\n\n')
        .replace(/<\/think>/g, '\n\n</details>\n\n');
};

const AITableRenderer = ({ content }: { content: string }) => {
    const lines = content.split('\n').map(l => l.trim()).filter(l => l.startsWith('|'));
    if (lines.length < 2) return <pre>{content}</pre>;

    const parseRow = (rowStr: string) => {
        let s = rowStr;
        if (s.startsWith('|')) s = s.substring(1);
        if (s.endsWith('|')) s = s.substring(0, s.length - 1);
        return s.split('|').map(x => x.trim());
    };

    const headers = parseRow(lines[0]);
    const rows = lines.slice(2).map(parseRow); 

    const normalizedRows = rows.map(row => {
        const newRow = [...row];
        while(newRow.length < headers.length) newRow.push('');
        return newRow.slice(0, headers.length);
    });

    return (
        <div style={{ overflowX: 'auto', margin: '15px 0' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13px', backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', borderRadius: '8px', overflow: 'hidden' }}>
                <thead>
                    <tr>
                        {headers.map((h, i) => (
                            <th key={i} style={{ borderBottom: '2px solid #cbd5e1', padding: '10px 12px', backgroundColor: '#f8fafc', color: '#334155', fontWeight: 'bold', textAlign: 'left', whiteSpace: 'nowrap' }}>
                                <ReactMarkdown>{h}</ReactMarkdown>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {normalizedRows.map((row, i) => (
                        <tr key={i}>
                            {row.map((cell, j) => (
                                <td key={j} style={{ borderBottom: '1px solid #f1f5f9', padding: '10px 12px', color: '#475569' }}>
                                    <ReactMarkdown>{cell}</ReactMarkdown>
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const localGroupBy = (data: any[], dimensions: string[], metrics: string[]) => {
    if (dimensions.length === 0 && metrics.length === 0) return data.slice(0, 100); 
    const map: { [key: string]: any } = {};
    data.forEach(row => {
        const key = dimensions.length > 0 ? dimensions.map(d => row[d] || '(空)').join('|||') : '全表汇总';
        if (!map[key]) {
            map[key] = {};
            dimensions.forEach(d => map[key][d] = row[d] || '(空)');
            metrics.forEach(m => map[key][m] = 0); 
        }
        metrics.forEach(m => {
            const val = parseFloat(row[m]);
            if (!isNaN(val)) map[key][m] += val;
        });
    });
    return Object.values(map).map(row => {
        metrics.forEach(m => { if (typeof row[m] === 'number') row[m] = Number(row[m].toFixed(2)); });
        return row;
    });
};

const generateMarkdownTable = (data: any[], columns: string[]) => {
    if (data.length === 0 || columns.length === 0) return "暂无数据";
    const header = `| ${columns.join(' | ')} |`;
    const separator = `| ${columns.map(() => '---').join(' | ')} |`;
    const rows = data.map(row => `| ${columns.map(col => row[col]).join(' | ')} |`).join('\n');
    return `${header}\n${separator}\n${rows}`;
};

const AIChartRenderer = ({ config, themeColor }: { config: any, themeColor: string }) => {
    const { data: rawData, type, yAxisName, chartType } = config;
    if (!rawData || !Array.isArray(rawData) || rawData.length === 0) {
        return <div style={{color: '#b91c1c', fontSize: 13, padding: '10px 15px', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', margin: '10px 0'}}>⚠️ <b>图表渲染中止：</b>AI 配置遗漏数据点。请通过提示词要求AI必须填充data数组。</div>;
    }
    const firstRow = rawData[0];
    const keys = Object.keys(firstRow);
    const xKey = keys.includes("name") ? "name" : (keys.find(k => typeof firstRow[k] === 'string') || keys[0]);
    const numKeys = keys.filter(k => typeof firstRow[k] === 'number' && k !== xKey);
    const data = rawData.map(item => ({ ...item, name: String(item[xKey]) }));
    let activeSeries = config.series;
    if (!activeSeries || !Array.isArray(activeSeries) || activeSeries.length === 0) {
        if (numKeys.length > 0) activeSeries = numKeys.map((k, i) => ({ name: k === 'value' ? (yAxisName || '数值') : k, dataKey: k, type: i === 0 ? (type || 'bar') : 'line', yAxis: i === 0 ? 'left' : 'right' }));
        else activeSeries = [{ name: yAxisName || '数值', dataKey: 'value', type: type || 'bar', yAxis: 'left' }];
    }
    const hasRightAxis = activeSeries.some((s: any) => s.yAxis === 'right');
    const colorPalette = [themeColor, '#FF9800', '#10B981', '#E91E63', '#8B5CF6', '#00BCD4'];

    return (
        <div style={{ width: '600px', maxWidth: '100%', overflowX: 'auto', marginTop: 15, marginBottom: 15, backgroundColor: '#ffffff', borderRadius: 8, border: '1px solid #e0e0e0', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', boxSizing: 'border-box' }}>
            <div style={{ width: '100%', minWidth: 300, height: 320, padding: '15px 15px 5px 5px', boxSizing: 'border-box' }}>
                <ResponsiveContainer width="100%" height="100%">
                    {chartType === 'pie' ? (
                        /* @ts-ignore */
                        <PieChart>
                            <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '13px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                            <Legend wrapperStyle={{ fontSize: '13px', paddingTop: '10px' }} />
                            {/* @ts-ignore */}
                            <Pie data={data} dataKey={numKeys.length > 0 ? numKeys[0] : "value"} nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} label>
                                {data.map((entry: any, index: number) => <Cell key={`cell-${index}`} fill={colorPalette[index % colorPalette.length]} />)}
                            </Pie>
                        </PieChart>
                    ) : chartType === 'area' ? (
                        /* @ts-ignore */
                        <AreaChart data={data} margin={{ top: 10, right: 20, bottom: 25, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="name" tick={{fontSize: 12, fill: '#666'}} tickMargin={10} angle={-45} textAnchor="end" />
                            <YAxis tick={{fontSize: 12, fill: '#666'}} tickMargin={5} width={60} />
                            <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '13px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                            <Legend wrapperStyle={{ fontSize: '13px', paddingTop: '20px' }} />
                            {activeSeries.map((s: any, index: number) => (
                                <Area key={index} type="monotone" dataKey={s.dataKey} name={s.name} fill={colorPalette[index % colorPalette.length]} stroke={colorPalette[index % colorPalette.length]} fillOpacity={0.3} />
                            ))}
                        </AreaChart>
                    ) : chartType === 'radar' ? (
                        /* @ts-ignore */
                        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data} margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                            <PolarGrid stroke="#e2e8f0" />
                            <PolarAngleAxis dataKey="name" tick={{fontSize: 11, fill: '#64748b'}} />
                            <PolarRadiusAxis angle={30} tick={{fontSize: 10, fill: '#94a3b8'}} />
                            <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '13px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                            <Legend wrapperStyle={{ fontSize: '13px', paddingTop: '10px' }} />
                            {activeSeries.map((s: any, index: number) => (
                                <Radar key={index} name={s.name} dataKey={s.dataKey} stroke={colorPalette[index % colorPalette.length]} fill={colorPalette[index % colorPalette.length]} fillOpacity={0.4} />
                            ))}
                        </RadarChart>
                    ) : chartType === 'horizontalBar' ? (
                        /* @ts-ignore */
                        <BarChart layout="vertical" data={data} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f0f0f0"/>
                            <XAxis type="number" tick={{fontSize: 12, fill: '#666'}} />
                            <YAxis dataKey="name" type="category" tick={{fontSize: 11, fill: '#333'}} width={90} />
                            <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '13px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                            <Legend wrapperStyle={{ fontSize: '13px', paddingTop: '10px' }} />
                            {activeSeries.map((s: any, index: number) => (
                                <Bar key={index} dataKey={s.dataKey} name={s.name} fill={colorPalette[index % colorPalette.length]} radius={[0, 4, 4, 0]} maxBarSize={30} />
                            ))}
                        </BarChart>
                    ) : (
                        /* @ts-ignore */
                        <ComposedChart data={data} margin={{ top: 10, right: hasRightAxis ? 10 : 20, bottom: 25, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="name" tick={{fontSize: 12, fill: '#666'}} tickMargin={10} angle={-45} textAnchor="end" />
                            <YAxis yAxisId="left" orientation="left" tick={{fontSize: 12, fill: '#666'}} tickMargin={5} width={60} />
                            {hasRightAxis && <YAxis yAxisId="right" orientation="right" tick={{fontSize: 12, fill: '#666'}} tickMargin={5} width={60} />}
                            <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '13px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                            <Legend wrapperStyle={{ fontSize: '13px', paddingTop: '20px' }} />
                            {activeSeries.map((s: any, index: number) => {
                                const itemColor = colorPalette[index % colorPalette.length];
                                if (s.type === 'line') return <Line key={index} yAxisId={s.yAxis || 'left'} type="monotone" dataKey={s.dataKey} name={s.name} stroke={itemColor} strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />;
                                else return <Bar key={index} yAxisId={s.yAxis || 'left'} dataKey={s.dataKey} name={s.name} fill={itemColor} radius={[4, 4, 0, 0]} maxBarSize={50} />;
                            })}
                        </ComposedChart>
                    )}
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export const ChatApp: React.FC<ChatProps> = (chatProps) => {
    const showDataTab = chatProps.enableDataInsight !== false; 
    const showDaxTab = chatProps.enableDaxCopilot !== false;

    const [activeMode, setActiveMode] = useState<"data" | "dax">("data");
    
    const [activeDims, setActiveDims] = useState<string[]>(chatProps.dimensionCols);
    useEffect(() => { setActiveDims(chatProps.dimensionCols); }, [chatProps.dimensionCols]);

    const toggleDim = (dim: string) => {
        if (!chatProps.allowInteractiveDims) return; 
        setActiveDims(prev => prev.includes(dim) ? prev.filter(d => d !== dim) : [...prev, dim]);
    };

    const [privacyMode, setPrivacyMode] = useState<"off" | "semi_text" | "full_text" | "strict">(() => {
        try {
            const saved = sessionStorage.getItem("longcat_pbi_privacy_mode");
            if (saved === "off" || saved === "semi_text" || saved === "full_text" || saved === "strict") {
                return saved;
            }
        } catch(e) {}
        return chatProps.defaultPrivacyMode || "semi_text"; 
    });

    const handlePrivacyChange = (mode: "off" | "semi_text" | "full_text" | "strict") => {
        setPrivacyMode(mode);
        try { sessionStorage.setItem("longcat_pbi_privacy_mode", mode); } catch(e) {}
    };

    useEffect(() => {
        if (activeMode === 'data' && !showDataTab && showDaxTab) setActiveMode('dax');
        if (activeMode === 'dax' && !showDaxTab && showDataTab) setActiveMode('data');
    }, [showDataTab, showDaxTab, activeMode]);

    const [dataMessages, setDataMessages] = useState<Message[]>([]);
    const [daxMessages, setDaxMessages] = useState<Message[]>([]);
    const [dataInputValue, setDataInputValue] = useState("");
    const [daxInputValue, setDaxInputValue] = useState("");
    
    const [loadingState, setLoadingState] = useState<"idle" | "routing" | "aggregating" | "analyzing">("idle");
    const [toastMsg, setToastMsg] = useState(""); 
    
    const [modelDictionary, setModelDictionary] = useState("");
    const [showScriptModal, setShowScriptModal] = useState<"TE" | "DAXStudio" | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    useEffect(() => { scrollToBottom(); }, [dataMessages, daxMessages, loadingState, activeMode]);

    const showToast = useCallback((msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(""), 3000); }, []);
    
    const copyTextToClipboard = useCallback((text: string, successMsg: string) => {
        const fallbackCopy = () => {
            try {
                const textArea = document.createElement("textarea"); textArea.value = text;
                textArea.style.top = "0"; textArea.style.left = "0"; textArea.style.position = "fixed"; 
                document.body.appendChild(textArea); textArea.focus(); textArea.select();
                const successful = document.execCommand('copy');
                document.body.removeChild(textArea);
                if (successful) showToast(successMsg); else showToast("复制失败，请手动复制");
            } catch (err) { showToast("复制失败，请手动复制"); }
        };
        if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(() => showToast(successMsg)).catch(() => fallbackCopy()); } 
        else { fallbackCopy(); }
    }, [showToast]);

    const numericScalar = useMemo(() => Math.random() * 0.8 + 0.1, []);
    const isBlacklistTriggered = chatProps.blacklistCols.length > 0;

    const dataDictionary = useMemo(() => {
        const data = chatProps.rawTableData;
        const columns = [...chatProps.dimensionCols, ...chatProps.metricCols];
        if (columns.length === 0 || data.length === 0) return null;
        
        const maskingMap: Record<string, string> = {};
        const unmaskingMap: Record<string, string> = {};
        const colCounters: Record<string, number> = {}; 
        
        data.forEach(row => {
            chatProps.dimensionCols.forEach(col => {
                const val = String(row[col] || '').trim();
                if (!val || val === "(空)" || val.length <= 1 || /^(是|否|无|空|有|男|女|未知)$/.test(val)) return;

                const isInBlacklist = chatProps.blacklistCols.includes(col);
                const shouldMask = isInBlacklist || privacyMode !== 'off';

                if (shouldMask) {
                    if (privacyMode === 'semi_text' && !isInBlacklist) {
                        if (/品|类|分类|牌|组|名|日期|月|年/.test(col)) return; 
                    }
                    if (!maskingMap[val]) {
                        if (!colCounters[col]) colCounters[col] = 1;
                        const prefix = isInBlacklist ? `保密${col}` : col;
                        const masked = `${prefix}_${String(colCounters[col]++).padStart(3, '0')}`;
                        maskingMap[val] = masked;
                        unmaskingMap[masked] = val;
                    }
                }
            });
        });

        const sortedRealVals = Object.keys(maskingMap).sort((a, b) => b.length - a.length);
        const sortedMaskedVals = Object.keys(unmaskingMap).sort((a, b) => b.length - a.length);
        const samples = data.slice(0, 3); 

        return { columns, samples, rawData: data, maskingMap, unmaskingMap, sortedRealVals, sortedMaskedVals };
    }, [chatProps.rawTableData, chatProps.dimensionCols, chatProps.metricCols, chatProps.blacklistCols, privacyMode]);

    const markdownComponents = useMemo(() => ({
        pre: (mdProps: any) => <pre style={{ margin: 0, padding: 0, background: 'none', border: 'none' }}>{mdProps.children}</pre>,
        
        a: (mdProps: any) => {
            const { href, children } = mdProps;
            if (href && href.startsWith('filter:')) {
                const filterVal = href.replace('filter:', '').trim();
                return (
                    <button onClick={() => chatProps.onFilter && chatProps.onFilter(filterVal)} style={{ backgroundColor: '#e0f2fe', color: '#0369a1', border: `1px solid ${chatProps.themeColor}55`, borderRadius: '12px', padding: '2px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', margin: '0 4px', display: 'inline-flex', alignItems: 'center', transition: 'all 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }} title={`联动筛选报表: ${filterVal}`}>
                        {children || `联动分析: ${filterVal}`}
                    </button>
                );
            }
            return <a {...mdProps} target="_blank" rel="noopener noreferrer">{children}</a>;
        },

        code: (mdProps: any) => {
            const { inline, className, children, node, ...restProps } = mdProps;
            const content = String(children || '').replace(/\n$/, '');

            if (inline && content.startsWith('filter:')) {
                const parts = content.split('filter:');
                if (parts.length > 1) {
                    const filterVal = parts[1].trim();
                    return (
                        <button onClick={() => chatProps.onFilter && chatProps.onFilter(filterVal)} style={{ backgroundColor: '#e0f2fe', color: '#0369a1', border: `1px solid ${chatProps.themeColor}55`, borderRadius: '12px', padding: '2px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', margin: '0 4px', display: 'inline-flex', alignItems: 'center', transition: 'all 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }} title={`联动筛选报表: ${filterVal}`}>
                            联动分析: {filterVal}
                        </button>
                    );
                }
            }

            const match = /language-(\w+)/.exec(className || '');
            if (!inline && match && match[1] === 'table') { return <AITableRenderer content={content} />; }
            
            const isChartLang = match && (match[1] === 'chart' || match[1] === 'json');

            if (!inline && isChartLang && activeMode === "data") {
                try { 
                    let cleanContent = content.replace(/\/\/.*$/gm, '').replace(/,\s*([\]}])/g, '$1').replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":').replace(/:\s*'([^']*)'/g, ': "$1"'); 
                    const config = JSON.parse(cleanContent);
                    if (match[1] === 'chart' || (config.chartType && config.data !== undefined)) {
                        return <AIChartRenderer config={config} themeColor={chatProps.themeColor || "#0F62FE"} />;
                    }
                } catch(e) { 
                    if (match && match[1] === 'chart') {
                        return <div className="error" style={{color:'red', fontSize:12, padding: 8, backgroundColor:'#fee', borderRadius:'4px'}}>图表 JSON 解析失败: {e.message}<br/><span style={{fontSize:'10px', color:'#666'}}>源码预览: {content.substring(0, 120)}...</span></div>; 
                    }
                }
            }
            
            if (!inline && match && match[1] === 'debug') {
                try {
                    const dbg = JSON.parse(content);
                    const cmpRate = dbg.rawRows > 0 ? ((1 - dbg.aggRows / dbg.rawRows) * 100).toFixed(1) : "0";

                    // 🌟 修改：显示出是否已禁用本地聚合的逻辑
                    const provenanceBadge = (
                        <div style={{ fontSize: '12px', color: '#475569', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '8px', marginBottom: chatProps.enableDebugMode ? '10px' : '0', lineHeight: '1.5' }}>
                            <div style={{ flex: '1 1 auto', minWidth: '0', wordWrap: 'break-word' }}>
                                <b>数据流转就绪：</b>提取 {dbg.rawRows} 行原始流水，{chatProps.disableAggregation ? `已禁用聚合，直接将 ${dbg.aggRows} 行明细直传至大模型引擎。` : `根据设定的颗粒度，按需聚合为 ${dbg.aggRows} 行送入大模型引擎。`}
                            </div>
                            {isBlacklistTriggered && <div style={{ color: '#ef4444', backgroundColor: '#fef2f2', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', border: '1px solid #fca5a5' }}>🎯 列级黑名单拦截网激活</div>}
                            {privacyMode !== 'off' && <div style={{ color: '#10B981', backgroundColor: '#ecfdf5', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', border: '1px solid #a7f3d0' }}>🛡️ 数据护盾处理完成</div>}
                        </div>
                    );

                    const debugDetails = chatProps.enableDebugMode ? (
                        <details style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px dashed #cbd5e1', fontSize: '12px' }}>
                            <summary style={{ cursor: 'pointer', fontWeight: 'bold', color: '#334155', userSelect: 'none' }}>
                                [开发者调试模式] 点击展开 Agent 路由与数据流转明细
                            </summary>
                            <div style={{ marginTop: '12px', color: '#334155', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div><div style={{fontWeight: 'bold', color: chatProps.themeColor}}>1. Agent 意图识别 (提取列):</div><div style={{marginLeft: '10px'}}>• 维度: {dbg.dims?.length > 0 ? dbg.dims.join(', ') : '未提取'}</div><div style={{marginLeft: '10px'}}>• 指标: {dbg.metrics?.length > 0 ? dbg.metrics.join(', ') : '未提取'}</div></div>
                                <div><div style={{fontWeight: 'bold', color: chatProps.themeColor}}>2. 本地引擎聚合统计:</div><div style={{marginLeft: '10px'}}>• 原始数据明细: <b>{dbg.rawRows}</b> 行</div><div style={{marginLeft: '10px'}}>• {chatProps.disableAggregation ? "禁用聚合，明细直传" : "聚合后数据量"}: <b>{dbg.aggRows}</b> 行 <span style={{color: '#10B981', fontWeight: 'bold'}}>(压缩率: {cmpRate}%)</span></div></div>
                                {dbg.preview && (
                                    <div><div style={{fontWeight: 'bold', color: chatProps.themeColor}}>3. 发送给 AI 的数据预览 (展示真实传递给AI的映射值):</div>
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', marginTop: '5px', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left', backgroundColor: 'white', border: '1px solid #e2e8f0' }}>
                                                <thead><tr>{dbg.preview.length > 0 && Object.keys(dbg.preview[0]).map(k => <th key={k} style={{borderBottom:'1px solid #cbd5e1', padding:'6px'}}>{k}</th>)}</tr></thead>
                                                <tbody>{dbg.preview.map((row: any, i: number) => (<tr key={i}>{Object.values(row).map((v: any, j: number) => <td key={j} style={{borderBottom:'1px solid #f1f5f9', padding:'6px'}}>{String(v)}</td>)}</tr>))}</tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </details>
                    ) : null;

                    return (
                        <div style={{ backgroundColor: '#f8fafc', padding: '12px 15px', borderRadius: '8px', border: '1px solid #e2e8f0', margin: '5px 0 15px 0', whiteSpace: 'normal' }}>
                            {provenanceBadge}
                            {debugDetails}
                        </div>
                    );
                } catch(e) { return null; }
            }

            if (!inline) {
                const lang = match ? match[1] : 'text';
                return (
                    <div style={{ position: 'relative', marginTop: '10px', marginBottom: '10px', borderRadius: '6px', border: '1px solid #334155', overflow: 'hidden', backgroundColor: '#1e1e1e' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#2d2d2d', padding: '4px 10px', borderBottom: '1px solid #475569' }}>
                            <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 'bold' }}>{lang.toUpperCase()}</span>
                            <button onClick={() => copyTextToClipboard(content, "代码段复制成功")} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#38bdf8', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>复制</button>
                        </div>
                        <SyntaxHighlighter language={lang === 'dax' ? 'sql' : lang} style={vscDarkPlus} customStyle={{ margin: 0, padding: '12px', fontSize: '13px', backgroundColor: 'transparent' }}>{content}</SyntaxHighlighter>
                    </div>
                );
            }
            return <code className={className} {...restProps}>{children}</code>;
        }
    }), [chatProps.onFilter, chatProps.themeColor, activeMode, chatProps.enableDebugMode, privacyMode, isBlacklistTriggered, chatProps.disableAggregation, copyTextToClipboard]);

    const clearChat = () => { 
        if (activeMode === "data") setDataMessages([]); else setDaxMessages([]); 
        showToast(`已清空分析上下文`); 
    };

    const isScaleExempt = (colName: string) => /数|率|比|排|店|SKU|期|年|月|日|次|单/.test(colName);

    const sendDataMessageToAI = async (userPrompt: string, displayMessage: string, isQuickCommand: boolean = false) => {
        if (!userPrompt.trim() || loadingState !== "idle") return;
        setDataInputValue("");
        const newMessages: Message[] = [...dataMessages, { role: "user", content: displayMessage }];
        setDataMessages(newMessages);

        if (!dataDictionary || dataDictionary.rawData.length === 0) {
            setDataMessages(prev => [...prev, { role: "assistant", content: "当前切片器条件下无数据：经过本地拦截检查，您当前在 Power BI 中筛选的区间没有任何数据记录传给 AI。" }]);
            return;
        }
        
        const endpoint = chatProps.baseUrl.endsWith("/chat/completions") ? chatProps.baseUrl : `${chatProps.baseUrl.replace(/\/$/, "")}/chat/completions`;
        const fetchHeaders = { "Content-Type": "application/json", "Authorization": `Bearer ${chatProps.apiKey.trim()}` };

        try {
            let optimizedDataString = "";
            let debugInfoObj: any = null; 

            let secureUserPrompt = userPrompt;
            let secureRawData = dataDictionary.rawData;

            if (dataDictionary.sortedRealVals.length > 0) {
                dataDictionary.sortedRealVals.forEach(realVal => {
                    if (secureUserPrompt.includes(realVal)) { secureUserPrompt = secureUserPrompt.split(realVal).join(dataDictionary.maskingMap[realVal]); }
                });
            }

            const forceScaleGlobal = privacyMode === 'strict';
            secureRawData = secureRawData.map(row => {
                const newRow = { ...row };
                Object.keys(newRow).forEach(k => {
                    const val = String(newRow[k] || '').trim();
                    if (dataDictionary.maskingMap[val]) {
                        newRow[k] = dataDictionary.maskingMap[val];
                    } 
                    else if (/^-?\d+(\.\d+)?$/.test(val.replace(/,/g, ''))) {
                        const isColBlacklisted = chatProps.blacklistCols.includes(k);
                        const forceScaleCol = isColBlacklisted || forceScaleGlobal;
                        
                        if (forceScaleCol && !isScaleExempt(k)) {
                            const num = parseFloat(val.replace(/,/g, ''));
                            if (!isNaN(num)) { newRow[k] = (num * numericScalar).toFixed(2); }
                        }
                    }
                });
                return newRow;
            });

            setLoadingState("routing");
            
            const routingPrompt = `你是一个底层数据提取路由 Agent。\n用户当前的查询域为：超市/零售业务数据分析。\n当前可用的前端面板颗粒度维度包含：${JSON.stringify(activeDims)}\n当前面板的指标列包含：${JSON.stringify(chatProps.metricCols)}\n用户提出的问题是："${secureUserPrompt}"\n\n【核心任务】：\n1. 判断用户问题是否与当前的零售分析、图表生成、业务指标相关。如果是闲聊（如查天气、写小说），必须返回 "isRelevant": false。\n2. 如果相关，请严格从我上方提供的【前端面板颗粒度维度】和【指标列】中，挑选出为回答该问题所必需的列名。\n\n请严格回复 JSON 对象：\n{ "isRelevant": boolean, "dimensions": ["选中的维度列名1"], "metrics": ["选中的指标列名1"] }`;

            const routeResponse = await fetch(endpoint, {
                method: "POST", headers: fetchHeaders,
                body: JSON.stringify({ model: chatProps.modelName, messages: [{ role: "user", content: routingPrompt }], temperature: 0.1 })
            });

            if (routeResponse.ok) {
                const routeData = await routeResponse.json();
                let routeJsonStr = routeData.choices[0].message.content.trim().replace(/```json/g, '').replace(/```/g, '').trim();
                try {
                    const routePlan = JSON.parse(routeJsonStr);
                    
                    if (chatProps.restrictDomain && routePlan.isRelevant === false) {
                        setLoadingState("idle");
                        setDataMessages(prev => [...prev, { role: "assistant", content: "抱歉，根据系统安全护栏设定，我仅能处理与**零售、当前提供的业务数据与指标**相关的诊断分析问题。如果您需要下钻数据或绘制图表，请随时向我提问。" }]);
                        return;
                    }

                    const { dimensions = [], metrics = [] } = routePlan;
                    const validDims = Array.from(new Set(dimensions.filter((d: string) => activeDims.includes(d)))) as string[];
                    const validMetrics = Array.from(new Set(metrics.filter((m: string) => chatProps.metricCols.includes(m)))) as string[];
                    
                    setLoadingState("aggregating");
                    
                    const finalMetrics = validMetrics.length > 0 ? validMetrics : chatProps.metricCols;
                    
                    // 🌟 核心逻辑：如果启用了禁用聚合，则直接直传
                    const aggregatedData = chatProps.disableAggregation 
                        ? secureRawData 
                        : localGroupBy(secureRawData, validDims, finalMetrics);
                        
                    const finalColumns = [...validDims, ...finalMetrics];
                    optimizedDataString = generateMarkdownTable(aggregatedData, finalColumns);
                    
                    debugInfoObj = {
                        dims: validDims, metrics: finalMetrics,
                        rawRows: secureRawData.length, aggRows: aggregatedData.length,
                        preview: aggregatedData.slice(0, 3)
                    };
                } catch (e) { console.warn("Agent 路由失败", e); }
            }

            if (!debugInfoObj) {
                // 🌟 兜底逻辑同样适配禁用聚合
                const aggregatedData = chatProps.disableAggregation 
                    ? secureRawData 
                    : localGroupBy(secureRawData, activeDims, chatProps.metricCols);
                optimizedDataString = generateMarkdownTable(aggregatedData, [...activeDims, ...chatProps.metricCols]);
                debugInfoObj = { dims: activeDims, metrics: chatProps.metricCols, rawRows: secureRawData.length, aggRows: aggregatedData.length, preview: aggregatedData.slice(0, 3) };
            }

            const metaDebugStr = "```debug\n" + JSON.stringify(debugInfoObj) + "\n```";
            setDataMessages(prev => [...prev, { role: "system_info", content: metaDebugStr }]);

            setLoadingState("analyzing"); 

            const privacyPromptExtension = forceScaleGlobal || isBlacklistTriggered
            ? `\n【数据护盾激活声明（极其重要）】\n当前提供的数据已触发安全黑名单拦截机制：\n1. 受限实体已被系统底层强制映射（如将具体名称映射为"保密品类_001"）。\n2. **受限业务线的所有绝对数值均已被统一按未知标量混淆缩放！**\n你可以精确地计算和分析占比、排名、同比/环比增速等相对指标，但绝对值已无现实意义。\n**强制要求：在文字报告中，只允许输出相对分析结果（如增幅、倍数、相对排名），严禁出现具体的绝对数值金额！严禁使用“百亿”、“千万”等词汇臆测业务体量！**\n` 
            : (privacyMode === 'semi_text' || privacyMode === 'full_text') 
            ? `\n【数据护盾激活声明】\n当前提供的数据已开启文本隐私模式：敏感文本已按列名进行安全映射。请直接使用这些映射后的代号进行分析。\n` 
            : "";

            const appliedCustomRules = (!isQuickCommand && chatProps.customSystemPrompt) 
                ? `\n${chatProps.customSystemPrompt}\n` 
                : "";

            const grandTotalInjection = chatProps.grandTotalText 
                ? `\n【全局大盘真实汇总（极度重要，分析时请绝对以此数据为准）】\n${chatProps.grandTotalText}\n` 
                : "";

            const finalSystemPrompt = `${chatProps.baseSystemPrompt}${privacyPromptExtension}${appliedCustomRules}

【动态交互与数据真理声明】
你当前运行在 Power BI 中。当涉及具体的事实计算时，**必须且只能以本次下方提供的最新数据快照为准！**
${grandTotalInjection}
### 当前为您准备的最新业务数据快照：
${optimizedDataString}`;

            let finalApiMessages = [
                { role: "system", content: finalSystemPrompt },
                ...newMessages.filter(m => m.role === "user" || m.role === "assistant").map(m => ({
                    role: m.role, content: m.content === displayMessage ? secureUserPrompt : m.content
                }))
            ];

            if (dataDictionary.sortedRealVals.length > 0) {
                finalApiMessages = finalApiMessages.map(msg => {
                    let safeContent = String(msg.content);
                    dataDictionary.sortedRealVals.forEach(realVal => {
                        if (safeContent.includes(realVal)) { safeContent = safeContent.split(realVal).join(dataDictionary.maskingMap[realVal]); }
                    });
                    return { ...msg, content: safeContent };
                });
            }

            const finalResponse = await fetch(endpoint, {
                method: "POST", headers: fetchHeaders,
                body: JSON.stringify({ model: chatProps.modelName, messages: finalApiMessages, temperature: 0.7, stream: false })
            });

            if (!finalResponse.ok) {
                const errorData = await finalResponse.json().catch(() => ({}));
                throw new Error(`HTTP ${finalResponse.status} - ${errorData.error?.message || "未知错误"}`);
            }

            const data = await finalResponse.json();
            if (data.error) throw new Error(data.error.message || "API 拒绝了请求");
            
            let fullContent = data.choices?.[0]?.message?.content || "";
            
            if (dataDictionary.sortedMaskedVals.length > 0) {
                dataDictionary.sortedMaskedVals.forEach(maskedVal => {
                    fullContent = fullContent.split(maskedVal).join(dataDictionary.unmaskingMap[maskedVal]);
                });
            }

            setDataMessages(prev => [...prev, { role: "assistant", content: fullContent }]);

        } catch (error: any) {
            setDataMessages(prev => [...prev, { role: "error", content: `请求出错：${error.message}` }]);
        } finally {
            setLoadingState("idle");
        }
    };

    const sendDaxMessageToAI = async (userPrompt: string) => {
        if (!userPrompt.trim() || loadingState !== "idle") return;
        setDaxInputValue("");
        const newDaxMessages: Message[] = [...daxMessages, { role: "user", content: userPrompt }];
        setDaxMessages(newDaxMessages);
        
        if (!modelDictionary.trim()) {
            setDaxMessages(prev => [...prev, { role: "error", content: "无法生成代码：请先在上方粘贴提取出的模型字典。" }]);
            return;
        }

        setLoadingState("analyzing");
        const endpoint = chatProps.baseUrl.endsWith("/chat/completions") ? chatProps.baseUrl : `${chatProps.baseUrl.replace(/\/$/, "")}/chat/completions`;
        const fetchHeaders = { "Content-Type": "application/json", "Authorization": `Bearer ${chatProps.apiKey.trim()}` };

        try {
            const daxSystemPrompt = `你是一位专业的 Microsoft Power BI DAX 专家。\n你的任务是根据用户提供的【模型结构字典】和需求，编写精准、性能极佳的 DAX 度量值或计算列公式。\n\n【绝对强制规则】：\n1. 【零幻觉】：你写在公式里的所有表名、列名、已有度量值，**必须 100% 存在于下方的模型字典中**。\n2. 【表间关系感知】：观察字典中的【表间关系】部分。如果逻辑跨越多张表，且关系是 "未激活(需USERELATIONSHIP)"，必须在 CALCULATE 中使用 USERELATIONSHIP 激活。\n3. 【数据类型与日期防错】：优先使用最安全的 DAX 原生时间函数直接作用于精确到天的日期列。\n4. 【代码格式约束】：所有的 DAX 代码必须且只能包裹在标准的 Markdown 代码块中，语言指定为 dax。\n5. 【解释简明】：给出代码后，用简短专业的中文解释这层 DAX 的计算逻辑。\n\n### 用户的当前模型结构字典如下：\n${modelDictionary}`;

            const apiMessages = [
                { role: "system", content: daxSystemPrompt },
                ...newDaxMessages.filter(m => m.role === "user" || m.role === "assistant").map(m => ({
                    role: m.role, content: m.content
                }))
            ];

            const response = await fetch(endpoint, {
                method: "POST", headers: fetchHeaders,
                body: JSON.stringify({ model: chatProps.modelName, messages: apiMessages, temperature: 0.2, stream: false })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`HTTP ${response.status} - ${errorData.error?.message || "未知错误"}`);
            }

            const data = await response.json();
            if (data.error) throw new Error(data.error.message || "API 拒绝了请求");
            
            const fullContent = data.choices?.[0]?.message?.content || "";
            setDaxMessages(prev => [...prev, { role: "assistant", content: fullContent }]);

        } catch (error: any) {
            setDaxMessages(prev => [...prev, { role: "error", content: `请求出错：${error.message}` }]);
        } finally {
            setLoadingState("idle");
        }
    };

    const handleSendInput = (p?: string) => {
        const txt = typeof p === 'string' ? p : currentInput;
        if (activeMode === "data") sendDataMessageToAI(txt, txt, false);
        else sendDaxMessageToAI(txt);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendInput(); } };
    
    const handleQuickCommand = (prompt: string, name: string) => { 
        sendDataMessageToAI(prompt, `[执行快捷指令] ${name}`, true); 
    };

    const copyToWord = () => {
        const currentMessages = activeMode === "data" ? dataMessages : daxMessages;
        if (currentMessages.length === 0) { showToast("当前会话为空"); return; }
        
        let htmlContent = `<div style="font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;"><h1 style="color: #333; text-align: center; border-bottom: 2px solid ${chatProps.themeColor}; padding-bottom: 10px;">AI 报告</h1><p style="color: #888; text-align: center; font-size: 12px; margin-bottom: 30px;">生成时间：${new Date().toLocaleString()}</p>`;
        let plainTextFallback = `# AI 报告\n生成时间：${new Date().toLocaleString()}\n\n---\n\n`;

        currentMessages.filter(m => m.role !== 'system_warning' && m.role !== 'system_info' && !m.content.startsWith('```debug')).forEach(m => {
            const isUser = m.role === 'user';
            const roleName = isUser ? '提问 / 指令' : 'AI 回复';
            const color = isUser ? chatProps.themeColor : '#2c3e50';
            const bgColor = isUser ? '#f0f7ff' : '#ffffff';
            
            htmlContent += `<div style="margin-bottom: 20px; padding: 15px; border-radius: 8px; background-color: ${bgColor}; border: 1px solid #e2e8f0;"><h3 style="color: ${color}; margin-top: 0; margin-bottom: 10px; font-size: 16px;">${roleName}</h3>`;
            
            let text = m.content;
            let plainText = m.content;
            
            plainText = plainText.replace(/```chart[\s\S]*?```/g, (match) => {
                try {
                    const jsonString = match.replace(/```chart\n?/, '').replace(/\n?```/, '');
                    const chartConfig = JSON.parse(jsonString);
                    let ptTable = `\n> [图表数据明细: ${chartConfig.xAxisName || '维度'}]\n`;
                    (chartConfig.data || []).forEach((item: any) => { ptTable += `> - ${item.name}: ${item.value || '详见图表'}\n`; });
                    return ptTable;
                } catch(e) { return '\n> [图表数据]\n'; }
            });
            plainTextFallback += `### ${roleName}\n${plainText}\n\n`;

            text = text.replace(/`filter:(.*?)`/g, '【重点分析: $1】');
            text = text.replace(/\x60\x60\x60chart[\s\S]*?\x60\x60\x60/g, () => `<div style="color:gray; font-style:italic;">[图表对象，请在BI查看]</div>`);
            text = text.replace(/^### (.*$)/gim, `<h4 style="color: ${chatProps.themeColor}; margin: 16px 0 8px 0; font-size: 15px;">$1</h4>`);
            text = text.replace(/^## (.*$)/gim, `<h3 style="color: #1e293b; margin: 18px 0 10px 0; font-size: 16px;">$1</h3>`);
            text = text.replace(/^# (.*$)/gim, `<h2 style="color: #0f172a; margin: 20px 0 12px 0; font-size: 18px;">$1</h2>`);
            text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            text = text.replace(/^[\*\-] (.*$)/gim, '<div style="margin-left: 20px; display: list-item; list-style-type: disc;">$1</div>');
            text = text.replace(/\n/g, '<br/>');
            htmlContent += `<div style="line-height: 1.6; font-size: 14px; color: #333;">${text}</div></div>`;
        });
        htmlContent += `</div>`;

        const copyHandler = (e: ClipboardEvent) => { if (e.clipboardData) { e.clipboardData.setData('text/html', htmlContent); e.clipboardData.setData('text/plain', plainTextFallback); e.preventDefault(); } };
        try {
            const textArea = document.createElement("textarea"); textArea.value = "dummy"; textArea.style.position = "fixed"; textArea.style.left = "-9999px"; 
            document.body.appendChild(textArea); textArea.select();
            document.addEventListener('copy', copyHandler); document.execCommand('copy'); document.removeEventListener('copy', copyHandler);
            document.body.removeChild(textArea);
            showToast("排版复制成功");
        } catch (e) { showToast("复制失败，请检查安全权限"); }
    };

    const renderScriptModal = () => {
        if (!showScriptModal) return null;
        const isTE = showScriptModal === "TE";
        const scriptCode = isTE 
        ? `var sb = new System.Text.StringBuilder();\nforeach(var t in Model.Tables) {\n    if(t.Name.StartsWith("LocalDateTable") || t.Name.StartsWith("DateTableTemplate")) continue;\n    sb.AppendLine("【表】: '" + t.Name + "'");\n    var colInfo = t.Columns.Select(c => {\n        string type = c.DataType.ToString().Replace("System.", "");\n        string format = !string.IsNullOrEmpty(c.FormatString) ? "|格式:" + c.FormatString : "";\n        return c.Name + "(" + type + format + ")";\n    });\n    sb.AppendLine("包含列: " + string.Join(", ", colInfo));\n    var ms = t.Measures.Select(m => m.Name).ToList();\n    if(ms.Count > 0) sb.AppendLine("度量值: " + string.Join(", ", ms));\n    sb.AppendLine("");\n}\nsb.AppendLine("【表间关系】");\nforeach(var r in Model.Relationships) {\n    string isActive = r.IsActive ? "已激活" : "未激活(需USERELATIONSHIP)";\n    sb.AppendLine("'" + r.FromTable.Name + "'[" + r.FromColumn.Name + "] ---> '" + r.ToTable.Name + "'[" + r.ToColumn.Name + "] (状态: " + isActive + ")");\n}\nSystem.Windows.Forms.Clipboard.SetText(sb.ToString());`
        : `DEFINE\n    VAR _Tables = SELECTCOLUMNS(INFO.TABLES(), "TableID", [ID], "TableName", [Name])\n    VAR _Columns = SELECTCOLUMNS(FILTER(INFO.COLUMNS(), [Type] IN {1, 2, 4}), "TableID", [TableID], "ColumnID", [ID], "ColName", COALESCE([ExplicitName], [InferredName]), "ObjectName", COALESCE([ExplicitName], [InferredName]) & "(" & SWITCH(COALESCE([ExplicitDataType], [InferredDataType]), 2, "String", 6, "Int", 8, "Double", 9, "Date", 10, "Decimal", 11, "Bool", "Any") & ")")\n    VAR _Measures = SELECTCOLUMNS(INFO.MEASURES(), "TableID", [TableID], "ObjectName", "[" & [Name] & "](度量值)")\n    VAR _Objects = UNION(SELECTCOLUMNS(_Columns, "TableID", [TableID], "ObjectName", [ObjectName]), _Measures)\n    VAR _Combined = NATURALINNERJOIN(_Tables, _Objects)\n    VAR _TableSchemaRaw = ADDCOLUMNS(_Tables, "DictStr", VAR currentTable = [TableName] VAR objects = FILTER(_Combined, [TableName] = currentTable && NOT(LEFT(currentTable, 14) = "LocalDateTable") && NOT(LEFT(currentTable, 17) = "DateTableTemplate")) RETURN IF(COUNTROWS(objects) > 0, "【表】: '" & currentTable & "' | 包含字段与度量值: " & CONCATENATEX(objects, [ObjectName], ", ")))\n    VAR _TableSchema = SELECTCOLUMNS(FILTER(_TableSchemaRaw, NOT ISBLANK([DictStr])), "AI_Model_Dictionary", [DictStr])\n    VAR _RelsRaw = ADDCOLUMNS(INFO.RELATIONSHIPS(), "DictStr", VAR fTblID = [FromTableID] VAR fColID = [FromColumnID] VAR tTblID = [ToTableID] VAR tColID = [ToColumnID] VAR isActive = IF([IsActive], "已激活", "未激活(需USERELATIONSHIP)") VAR fTblName = MAXX(FILTER(_Tables, [TableID] = fTblID), [TableName]) VAR fColName = MAXX(FILTER(_Columns, [TableID] = fTblID && [ColumnID] = fColID), [ColName]) VAR tTblName = MAXX(FILTER(_Tables, [TableID] = tTblID), [TableName]) VAR tColName = MAXX(FILTER(_Columns, [TableID] = tTblID && [ColumnID] = tColID), [ColName]) RETURN IF(NOT(LEFT(fTblName, 14) = "LocalDateTable") && NOT(LEFT(tTblName, 14) = "LocalDateTable") && NOT(ISBLANK(fTblName)), "【表间关系】: '" & fTblName & "'[" & fColName & "] ---> '" & tTblName & "'[" & tColName & "] (状态: " & isActive & ")"))\n    VAR _Rels = SELECTCOLUMNS(FILTER(_RelsRaw, NOT ISBLANK([DictStr])), "AI_Model_Dictionary", [DictStr])\nEVALUATE UNION(_TableSchema, _Rels)`;

        return (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <div style={{ width: '85%', backgroundColor: 'white', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
                    <h3 style={{ margin: 0, color: '#334155' }}>{isTE ? "TE 提取" : "DAX Studio 提取"}</h3>
                    <textarea readOnly value={scriptCode} style={{ width: '100%', height: '140px', fontSize: '12px', fontFamily: 'monospace', padding: '10px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', boxSizing: 'border-box' }} />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                        <button onClick={() => setShowScriptModal(null)} style={{ padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', backgroundColor: '#e2e8f0', color: '#475569', fontWeight: 'bold' }}>关闭</button>
                        <button onClick={() => copyTextToClipboard(scriptCode, "提取脚本已复制到剪贴板")} style={{ padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', backgroundColor: chatProps.themeColor, color: 'white', fontWeight: 'bold' }}>复制代码</button>
                    </div>
                </div>
            </div>
        );
    };

    if (!showDataTab && !showDaxTab) {
        return (
            <div className="chat-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' }}>
                <div style={{ fontSize: '50px', marginBottom: '15px' }}>模块未启用</div>
                <p style={{ color: '#64748b', fontSize: '13px' }}>请在视觉对象格式面板中，开启所需功能。</p>
            </div>
        );
    }

    const currentMessages = activeMode === "data" ? dataMessages : daxMessages;
    const currentInput = activeMode === "data" ? dataInputValue : daxInputValue;
    const setCurrentInput = activeMode === "data" ? setDataInputValue : setDaxInputValue;

    return (
        <div className="chat-container" style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <style>{`
                .chat-container * {
                    -webkit-font-smoothing: antialiased;
                    -moz-osx-font-smoothing: grayscale;
                }
                .chat-messages {
                    transform: translateZ(0); 
                    backface-visibility: hidden;
                }
            `}</style>
            
            {toastMsg && <div className="toast-notification">{toastMsg}</div>}
            {renderScriptModal()}

            <div className="chat-header" style={{ backgroundColor: chatProps.themeColor, paddingBottom: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', width: '100%', boxSizing: 'border-box', padding: '10px 15px', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '15px', textAlign: 'left' }}>
                        {chatProps.botName || "分析助手"}
                    </div>
                    <div className="header-actions" style={{ display: 'flex', gap: '8px' }}>
                        <button className="header-btn" onClick={clearChat} title="清空当前页面对话上下文">清空</button>
                        <button className="header-btn" onClick={copyToWord}>导出</button>
                    </div>
                </div>

                {showDataTab && showDaxTab && (
                    <div style={{ display: 'flex', backgroundColor: 'rgba(0,0,0,0.15)', padding: '8px 15px 0 15px', gap: '10px', width: '100%', boxSizing: 'border-box' }}>
                        <button onClick={() => setActiveMode("data")} style={{ flex: 1, padding: '12px 0', border: 'none', background: activeMode === 'data' ? 'white' : 'transparent', color: activeMode === 'data' ? chatProps.themeColor : 'rgba(255,255,255,0.85)', fontWeight: activeMode === 'data' ? 'bold' : 'normal', borderRadius: '10px 10px 0 0', cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap', fontSize: '14px', letterSpacing: '1px' }}>数据洞察</button>
                        <button onClick={() => setActiveMode("dax")} style={{ flex: 1, padding: '12px 0', border: 'none', background: activeMode === 'dax' ? 'white' : 'transparent', color: activeMode === 'dax' ? chatProps.themeColor : 'rgba(255,255,255,0.85)', fontWeight: activeMode === 'dax' ? 'bold' : 'normal', borderRadius: '10px 10px 0 0', cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap', fontSize: '14px', letterSpacing: '1px' }}>DAX 助手</button>
                    </div>
                )}
            </div>

            {activeMode === "data" && (
                <div style={{ padding: '10px 15px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>
                        {chatProps.allowInteractiveDims ? "⚙️ 分析颗粒度 (点击开启/关闭底层聚合)：" : "📊 当前载入的分析维度："}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {chatProps.dimensionCols.map((dim, idx) => (
                            <button 
                                key={idx} 
                                onClick={() => toggleDim(dim)}
                                style={{
                                    padding: '4px 10px', fontSize: '11px', borderRadius: '12px',
                                    border: 'none', transition: 'all 0.2s',
                                    cursor: chatProps.allowInteractiveDims ? 'pointer' : 'default',
                                    backgroundColor: activeDims.includes(dim) ? chatProps.themeColor : '#e2e8f0',
                                    color: activeDims.includes(dim) ? 'white' : '#64748b',
                                    fontWeight: activeDims.includes(dim) ? 'bold' : 'normal',
                                    opacity: chatProps.allowInteractiveDims ? 1 : 0.85
                                }}
                            >
                                {activeDims.includes(dim) ? '✓ ' : ''}{dim}
                            </button>
                        ))}
                    </div>
                    {chatProps.metricCols.length > 0 && (
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                            当前载入指标：{chatProps.metricCols.join('、')}
                        </div>
                    )}
                </div>
            )}

            {activeMode === "data" && chatProps.quickCommands.length > 0 && (
                <div className="quick-commands-bar">
                    {chatProps.showAutoInsight && <button className="qc-btn auto-insight" onClick={() => handleQuickCommand(chatProps.autoInsightPrompt, chatProps.autoInsightName)}>{chatProps.autoInsightName || "自动洞察"}</button>}
                    {chatProps.quickCommands.map((cmd, idx) => <button key={idx} className="qc-btn" onClick={() => handleQuickCommand(cmd.prompt, cmd.name)}>{cmd.name}</button>)}
                </div>
            )}

            {activeMode === "dax" && (
                <div style={{ padding: '12px 15px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
                        <button onClick={() => setShowScriptModal("TE")} style={{ flex: 1, padding: '6px', fontSize: '12px', backgroundColor: 'white', border: `1px solid ${chatProps.themeColor}`, color: chatProps.themeColor, borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>TE 提取脚本</button>
                        <button onClick={() => setShowScriptModal("DAXStudio")} style={{ flex: 1, padding: '6px', fontSize: '12px', backgroundColor: 'white', border: `1px solid ${chatProps.themeColor}`, color: chatProps.themeColor, borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>DAX Studio 脚本</button>
                    </div>
                    <textarea 
                        placeholder="请在此处粘贴提取出的模型字典..."
                        value={modelDictionary}
                        onChange={(e) => setModelDictionary(e.target.value)}
                        style={{ width: '100%', height: '60px', fontSize: '12px', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', resize: 'none', boxSizing: 'border-box' }}
                    />
                </div>
            )}

            <div className="chat-messages" style={{ flex: 1, overflowY: 'auto', paddingBottom: '10px' }}>
                {currentMessages.length === 0 && (
                    <div className="welcome-msg" style={{ marginTop: '20px' }}>
                        {activeMode === "data" ? (
                            <>
                                <b>数据洞察就绪</b><br/>您可以提问业务指标、要求绘制图表或进行多维分析。
                                
                                {chatProps.instructions && (
                                    <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#fff', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#475569', fontSize: '13px', textAlign: 'left', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                                        <ReactMarkdown components={markdownComponents}>
                                            {chatProps.instructions}
                                        </ReactMarkdown>
                                    </div>
                                )}
                            </>
                        ) : (
                            <><b>DAX 助手就绪</b><br/>请粘贴模型字典后输入自然语言描述计算逻辑。</>
                        )}
                    </div>
                )}
                {currentMessages.map((msg, index) => (
                    <div key={index} className={`message-wrapper ${msg.role === 'system_warning' ? 'error' : msg.role}`}>
                        {msg.role === 'system_info' ? (
                            <div style={{ width: '100%', boxSizing: 'border-box', padding: '0 15px' }}>
                                <ReactMarkdown components={markdownComponents}>
                                    {msg.content}
                                </ReactMarkdown>
                            </div>
                        ) : (
                            <div className="message-bubble" style={msg.role === "user" ? { backgroundColor: chatProps.themeColor, color: "white" } : {}}>
                                <MessageErrorBoundary rawContent={msg.content}>
                                    {msg.role === "user" ? msg.content : (
                                        <ReactMarkdown components={markdownComponents}>
                                            {transformTablesToCodeBlocks(processThinkTags(msg.content))}
                                        </ReactMarkdown>
                                    )}
                                </MessageErrorBoundary>
                            </div>
                        )}
                    </div>
                ))}
                
                {loadingState !== "idle" && (
                    <div className="message-wrapper assistant">
                        <div className="message-bubble typing" style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#666' }}>
                            {loadingState === "routing" && <span>Agent 思考中：安全边界审核与路由...</span>}
                            {loadingState === "aggregating" && <span>Agent 执行中：本地按需聚合明细数据...</span>}
                            {loadingState === "analyzing" && <ThinkingAnimation themeColor={chatProps.themeColor} />}
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-area" style={{ borderTop: '1px solid #e2e8f0', padding: '12px 15px', backgroundColor: '#fff', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {activeMode === "data" && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>数据隐私模式：</span>
                            <select 
                                value={privacyMode} 
                                onChange={(e) => handlePrivacyChange(e.target.value as any)}
                                style={{ fontSize: '12px', padding: '2px 4px', border: '1px solid #cbd5e1', borderRadius: '4px', outline: 'none', backgroundColor: '#f8fafc', color: '#334155', cursor: 'pointer' }}
                            >
                                <option value="off">关闭：全明文发送</option>
                                <option value="semi_text">关键隐私：关键实体映射替换</option>
                                <option value="full_text">全文本隐私：所有维度全替换</option>
                                <option value="strict">严格隐私：文本全替换 + 核心数字标量混淆</option>
                            </select>
                            {isBlacklistTriggered && <span style={{ fontSize: '11px', color: '#ef4444', marginLeft: '10px' }}>⚠️ 检测到黑名单字段传入，已强制启用数值混淆与文本脱敏拦截。</span>}
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'stretch' }}>
                    <textarea
                        value={currentInput}
                        onChange={(e) => setCurrentInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={activeMode === "data" ? "输入问题，例如：对比今年和同期的销售额... (Shift+Enter 换行)" : "描述度量值，例如：计算天津门店销售额同比..."}
                        disabled={loadingState !== "idle" || !chatProps.apiKey}
                        style={{ flex: 1, minHeight: '40px', maxHeight: '120px', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', resize: 'vertical', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }}
                    />
                    <button 
                        onClick={() => handleSendInput()} 
                        disabled={loadingState !== "idle" || !currentInput.trim() || !chatProps.apiKey} 
                        style={{ 
                            backgroundColor: (currentInput.trim() && chatProps.apiKey && loadingState === "idle") ? chatProps.themeColor : "#ccc",
                            color: 'white', border: 'none', borderRadius: '6px', padding: '0 20px', cursor: (currentInput.trim() && chatProps.apiKey && loadingState === "idle") ? 'pointer' : 'not-allowed', fontWeight: 'bold', whiteSpace: 'nowrap'
                        }}
                    >
                        发送
                    </button>
                </div>
            </div>
        </div>
    );
};