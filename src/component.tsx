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
    baseSystemPrompt: string; customSystemPrompt: string; businessData: string; quickCommands: QuickCommand[];
    instructions?: string;
    baseUrl: string; apiKey: string; modelName: string; 
    botName: string; themeColor: string; showAutoInsight: boolean;
    autoInsightName: string; autoInsightPrompt: string;
    onFilter?: (filterName: string) => void;
    enableDataInsight?: boolean; 
    enableDaxCopilot?: boolean;
    enableDebugMode?: boolean;
    defaultPrivacyMode: "off" | "semi_text" | "full_text" | "strict";
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
                    <b style={{display: 'flex', alignItems: 'center', gap: '5px'}}>渲染引擎保护 <span style={{fontSize:'10px', fontWeight:'normal', color: '#b91c1c'}}>(已自动降级为纯文本模式)</span></b>
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

const parseMarkdownTable = (mdString: string) => {
    const lines = mdString.split('\n').map(l => l.trim()).filter(l => l.startsWith('|'));
    if (lines.length < 3) return { columns: [], data: [] };
    const headerLine = lines[0];
    const columns = headerLine.substring(1, headerLine.length - 1).split('|').map(s => s.trim());
    const data = [];
    for (let i = 2; i < lines.length; i++) {
        const rowLine = lines[i];
        const cleanRow = rowLine.substring(1, rowLine.length - 1);
        const valuesArr = cleanRow.split('|').map(s => s.trim());
        let rowObj: any = {};
        columns.forEach((col, idx) => { rowObj[col] = valuesArr[idx] !== undefined ? valuesArr[idx] : ''; });
        data.push(rowObj);
    }
    return { columns, data };
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
            const actualKey = Object.keys(row).find(k => k.trim() === m.trim()) || m;
            const rawVal = String(row[actualKey] || '').replace(/[^0-9.-]/g, '');
            const val = parseFloat(rawVal);
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
        return (
            <div style={{color: '#b91c1c', fontSize: 13, padding: '10px 15px', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', margin: '10px 0'}}>
                ⚠️ <b>图表渲染中止：</b>AI 生成的配置中遗漏了具体的数值信息（`data` 数组为空）。
                <br/>
                <span style={{fontSize: 11, color: '#dc2626'}}>💡 建议纠正：请尝试对 AI 追问：“请重新绘制图表，并务必在 JSON 的 data 数组中填入真实的数据点。”</span>
            </div>
        );
    }
    
    const firstRow = rawData[0];
    const keys = Object.keys(firstRow);
    const xKey = keys.includes("name") ? "name" : (keys.find(k => typeof firstRow[k] === 'string') || keys[0]);
    const numKeys = keys.filter(k => typeof firstRow[k] === 'number' && k !== xKey);
    const data = rawData.map(item => ({ ...item, name: String(item[xKey]) }));

    let activeSeries = config.series;
    if (!activeSeries || !Array.isArray(activeSeries) || activeSeries.length === 0) {
        if (numKeys.length > 0) {
            activeSeries = numKeys.map((k, i) => ({
                name: k === 'value' ? (yAxisName || '数值') : k,
                dataKey: k, type: i === 0 ? (type || 'bar') : 'line', yAxis: i === 0 ? 'left' : 'right'
            }));
        } else {
            activeSeries = [{ name: yAxisName || '数值', dataKey: 'value', type: type || 'bar', yAxis: 'left' }];
        }
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
                const textArea = document.createElement("textarea");
                textArea.value = text;
                textArea.style.top = "0"; textArea.style.left = "0"; textArea.style.position = "fixed"; 
                document.body.appendChild(textArea); textArea.focus(); textArea.select();
                const successful = document.execCommand('copy');
                document.body.removeChild(textArea);
                if (successful) showToast(successMsg); else showToast("复制失败，请手动复制");
            } catch (err) { showToast("复制失败，请手动复制"); }
        };
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(() => showToast(successMsg)).catch(() => fallbackCopy());
        } else { fallbackCopy(); }
    }, [showToast]);

    const numericScalar = useMemo(() => Math.random() * 0.8 + 0.1, []);

    const dataDictionary = useMemo(() => {
        const { columns, data } = parseMarkdownTable(chatProps.businessData);
        if (columns.length === 0) return null;
        
        const maskingMap: Record<string, string> = {};
        const unmaskingMap: Record<string, string> = {};
        const colCounters: Record<string, number> = {}; 
        
        if (data.length > 0 && privacyMode !== 'off') {
            const dimCols = columns.filter(col => {
                for (let i = 0; i < Math.min(data.length, 10); i++) {
                    const val = String(data[i][col] || '').trim();
                    if (val && !/^[\d.,¥$￥€£%+\-\s]+$/.test(val)) return true;
                }
                return false; 
            });

            data.forEach(row => {
                dimCols.forEach(col => {
                    const val = String(row[col] || '').trim();
                    if (!val || val.length <= 1 || /^(是|否|无|空|有|男|女|未知)$/.test(val)) return;

                    if (privacyMode === 'semi_text') {
                        if (/品|类|分类|牌|组|名|日期|月|年/.test(col)) {
                            // 保留明文
                        } else {
                            if (!maskingMap[val]) {
                                if (!colCounters[col]) colCounters[col] = 1;
                                const masked = `${col}_${String(colCounters[col]++).padStart(3, '0')}`;
                                maskingMap[val] = masked;
                                unmaskingMap[masked] = val;
                            }
                        }
                    } else if (privacyMode === 'full_text' || privacyMode === 'strict') {
                        if (!maskingMap[val]) {
                            if (!colCounters[col]) colCounters[col] = 1;
                            const masked = `${col}_${String(colCounters[col]++).padStart(3, '0')}`;
                            maskingMap[val] = masked;
                            unmaskingMap[masked] = val;
                        }
                    }
                });
            });
        }

        const sortedRealVals = Object.keys(maskingMap).sort((a, b) => b.length - a.length);
        const sortedMaskedVals = Object.keys(unmaskingMap).sort((a, b) => b.length - a.length);
        const samples = data.slice(0, 3); 

        return { columns, samples, rawData: data, maskingMap, unmaskingMap, sortedRealVals, sortedMaskedVals };
    }, [chatProps.businessData, privacyMode]);

    const dynamicPrompts = useMemo(() => {
        if (!dataDictionary || dataDictionary.columns.length === 0) return [];
        const cols = dataDictionary.columns;
        const metrics = cols.filter(c => /金额|数量|额|量|率|比/.test(c));
        const dims = cols.filter(c => !/金额|数量|额|量|率|比/.test(c));
        const m1 = metrics.length > 0 ? metrics[0] : cols[0];
        const d1 = dims.length > 0 ? dims[0] : cols[1 % cols.length];
        const d2 = dims.length > 1 ? dims[1] : cols[2 % cols.length];
        return [
            `帮我列出 [${d1}] 在 [${m1}] 指标上的排行榜`,
            `对比一下不同 [${d2}] 的 [${m1}] 表现差异`
        ];
    }, [dataDictionary]);

    const markdownComponents = useMemo(() => ({
        pre: (mdProps: any) => <pre style={{ margin: 0, padding: 0, background: 'none', border: 'none' }}>{mdProps.children}</pre>,
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
            
            if (!inline && match && match[1] === 'table') {
                return <AITableRenderer content={content} />;
            }
            
            if (!inline && match && match[1] === 'chart' && activeMode === "data") {
                try { 
                    let cleanContent = content.replace(/\/\/.*$/gm, ''); 
                    cleanContent = cleanContent.replace(/,\s*([\]}])/g, '$1'); 
                    cleanContent = cleanContent.replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":'); 
                    cleanContent = cleanContent.replace(/:\s*'([^']*)'/g, ': "$1"'); 
                    
                    const config = JSON.parse(cleanContent); 
                    return <AIChartRenderer config={config} themeColor={chatProps.themeColor || "#0F62FE"} />; 
                } 
                catch(e) { 
                    return <div className="error" style={{color:'red', fontSize:12, padding: 8, backgroundColor:'#fee', borderRadius:'4px'}}>图表 JSON 解析失败: {e.message}<br/><span style={{fontSize:'10px', color:'#666'}}>源码预览: {content.substring(0, 120)}...</span></div>; 
                }
            }
            
            if (!inline && match && match[1] === 'debug') {
                try {
                    const dbg = JSON.parse(content);
                    const cmpRate = dbg.rawRows > 0 ? ((1 - dbg.aggRows / dbg.rawRows) * 100).toFixed(1) : 0;
                    
                    const provenanceBadge = (
                        <div style={{ fontSize: '12px', color: '#475569', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '8px', marginBottom: chatProps.enableDebugMode ? '10px' : '0', lineHeight: '1.5' }}>
                            <div style={{ flex: '1 1 auto', minWidth: '0', wordWrap: 'break-word' }}>
                                <b>数据预处理完成：</b>提取了 {dbg.rawRows} 行流水，聚合为 {dbg.aggRows} 行特征数据。
                            </div>
                            {privacyMode !== 'off' && <div style={{ color: '#10B981', backgroundColor: '#ecfdf5', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', border: '1px solid #a7f3d0', whiteSpace: 'nowrap', flexShrink: 0 }}>数据护盾处理完成</div>}
                        </div>
                    );

                    const debugDetails = chatProps.enableDebugMode ? (
                        <details style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px dashed #cbd5e1', fontSize: '12px' }}>
                            <summary style={{ cursor: 'pointer', fontWeight: 'bold', color: '#334155', userSelect: 'none' }}>
                                [开发者调试模式] 点击展开 Agent 路由与数据流转明细
                            </summary>
                            <div style={{ marginTop: '12px', color: '#334155', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div><div style={{fontWeight: 'bold', color: chatProps.themeColor}}>1. Agent 意图识别 (提取列):</div><div style={{marginLeft: '10px'}}>• 维度: {dbg.dims.length > 0 ? dbg.dims.join(', ') : '未提取'}</div><div style={{marginLeft: '10px'}}>• 指标: {dbg.metrics.length > 0 ? dbg.metrics.join(', ') : '未提取'}</div></div>
                                <div><div style={{fontWeight: 'bold', color: chatProps.themeColor}}>2. 本地引擎聚合统计:</div><div style={{marginLeft: '10px'}}>• 原始数据明细: <b>{dbg.rawRows}</b> 行</div><div style={{marginLeft: '10px'}}>• 聚合后数据量: <b>{dbg.aggRows}</b> 行 × <b>{dbg.cols}</b> 列 <span style={{color: '#10B981', fontWeight: 'bold'}}>(数据压缩率: {cmpRate}%)</span></div></div>
                                <div><div style={{fontWeight: 'bold', color: chatProps.themeColor}}>3. 发送给 AI 的数据预览 (展示真实传递给AI的映射值):</div>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', marginTop: '5px', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left', backgroundColor: 'white', border: '1px solid #e2e8f0' }}>
                                            <thead><tr>{dbg.preview.length > 0 && Object.keys(dbg.preview[0]).map(k => <th key={k} style={{borderBottom:'1px solid #cbd5e1', padding:'6px'}}>{k}</th>)}</tr></thead>
                                            <tbody>{dbg.preview.map((row: any, i: number) => (<tr key={i}>{Object.values(row).map((v: any, j: number) => <td key={j} style={{borderBottom:'1px solid #f1f5f9', padding:'6px'}}>{String(v)}</td>)}</tr>))}</tbody>
                                        </table>
                                    </div>
                                </div>
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
                            <button 
                                onClick={() => copyTextToClipboard(content, "代码段复制成功")}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#38bdf8', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                                复制
                            </button>
                        </div>
                        <SyntaxHighlighter language={lang === 'dax' ? 'sql' : lang} style={vscDarkPlus} customStyle={{ margin: 0, padding: '12px', fontSize: '13px', backgroundColor: 'transparent' }}>
                            {content}
                        </SyntaxHighlighter>
                    </div>
                );
            }
            return <code className={className} {...restProps}>{children}</code>;
        }
    }), [chatProps.onFilter, chatProps.themeColor, activeMode, chatProps.enableDebugMode, privacyMode, copyTextToClipboard]);

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

        if (dataDictionary && dataDictionary.rawData.length === 0) {
            setDataMessages(prev => [...prev, { role: "assistant", content: "当前切片器条件下无数据：经过本地拦截检查，您当前在 Power BI 中筛选的区间没有任何数据记录传给 AI。" }]);
            return;
        }
        
        const endpoint = chatProps.baseUrl.endsWith("/chat/completions") ? chatProps.baseUrl : `${chatProps.baseUrl.replace(/\/$/, "")}/chat/completions`;
        const fetchHeaders = { "Content-Type": "application/json", "Authorization": `Bearer ${chatProps.apiKey.trim()}` };

        try {
            let optimizedDataString = chatProps.businessData;
            let debugInfoObj: any = null; 

            let secureUserPrompt = userPrompt;
            let secureRawData = dataDictionary?.rawData || [];
            let secureSamples = dataDictionary?.samples || [];

            if (privacyMode !== 'off' && dataDictionary) {
                dataDictionary.sortedRealVals.forEach(realVal => {
                    if (secureUserPrompt.includes(realVal)) {
                        secureUserPrompt = secureUserPrompt.split(realVal).join(dataDictionary.maskingMap[realVal]);
                    }
                });

                secureRawData = dataDictionary.rawData.map(row => {
                    const newRow = { ...row };
                    Object.keys(newRow).forEach(k => {
                        const val = String(newRow[k] || '').trim();
                        if (dataDictionary.maskingMap[val]) {
                            newRow[k] = dataDictionary.maskingMap[val];
                        } else if (privacyMode === 'strict' && /^-?\d+(\.\d+)?$/.test(val.replace(/,/g, ''))) {
                            if (!isScaleExempt(k)) {
                                const num = parseFloat(val.replace(/,/g, ''));
                                if (!isNaN(num)) {
                                    newRow[k] = (num * numericScalar).toFixed(2);
                                }
                            }
                        }
                    });
                    return newRow;
                });
                secureSamples = secureRawData.slice(0, 3);
            }

            if (dataDictionary && dataDictionary.columns.length > 0) {
                setLoadingState("routing");
                const routingPrompt = `你是一个底层数据提取路由 Agent。\n用户的业务数据拥有以下精确列名：${JSON.stringify(dataDictionary.columns)}\n前3行数据样本：${JSON.stringify(secureSamples)}\n用户当前提出的问题是："${secureUserPrompt}"\n请判断为了回答这个问题并且画出图表，我们需要保留哪些列？\n请严格回复一个 JSON 对象，绝不允许输出任何多余的文字！\n【重要警告】：\n1. JSON 中的列名必须【100% 照抄】上方提供的精确列名！\n2. 如果用户的问题包含了【过滤条件】，你【必须】将代表这些条件的列名也放进 "dimensions" 数组中！\n3. "dimensions" 存放所有需要的文本、日期、分类维度列。\n4. "metrics" 存放所有需要计算的数值指标列。\n格式规范：\n{ "dimensions": ["精确列名1"], "metrics": ["精确数值列名"] }`;

                const routeResponse = await fetch(endpoint, {
                    method: "POST", headers: fetchHeaders,
                    body: JSON.stringify({ model: chatProps.modelName, messages: [{ role: "user", content: routingPrompt }], temperature: 0.1, max_tokens: 200 })
                });

                if (routeResponse.ok) {
                    const routeData = await routeResponse.json();
                    let routeJsonStr = routeData.choices[0].message.content.trim();
                    routeJsonStr = routeJsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
                    try {
                        const routePlan = JSON.parse(routeJsonStr);
                        const { dimensions = [], metrics = [] } = routePlan;
                        const matchColumn = (requestedName: string): string | null => {
                            if (dataDictionary.columns.includes(requestedName)) return requestedName;
                            const cleanReq = requestedName.replace(/金额|数量|额|量|名称|名/g, '');
                            const fuzzy = dataDictionary.columns.find(c => c.includes(cleanReq) || cleanReq.includes(c));
                            return fuzzy || null;
                        };
                        const validDims = Array.from(new Set(dimensions.map((d: string) => matchColumn(d)).filter(Boolean))) as string[];
                        const validMetrics = Array.from(new Set(metrics.map((m: string) => matchColumn(m)).filter(Boolean))) as string[];
                        
                        if (validDims.length > 0 || validMetrics.length > 0) {
                            setLoadingState("aggregating");
                            const aggregatedData = localGroupBy(secureRawData, validDims, validMetrics);
                            const finalColumns = [...validDims, ...validMetrics];
                            optimizedDataString = generateMarkdownTable(aggregatedData, finalColumns);
                            
                            debugInfoObj = {
                                dims: validDims, metrics: validMetrics,
                                rawRows: secureRawData.length, aggRows: aggregatedData.length,
                                cols: finalColumns.length, chars: optimizedDataString.length,
                                preview: aggregatedData.slice(0, 3)
                            };
                        }
                    } catch (e) { console.warn("Agent 路由 JSON 解析失败:", routeJsonStr); }
                }
            }

            if (!debugInfoObj) {
                debugInfoObj = {
                    dims: ['(未触发挥发/路由失败)'], metrics: [],
                    rawRows: dataDictionary?.rawData.length || 0, aggRows: dataDictionary?.rawData.length || 0,
                    cols: dataDictionary?.columns.length || 0, chars: optimizedDataString.length,
                    preview: secureSamples
                };
            }

            const metaDebugStr = "```debug\n" + JSON.stringify(debugInfoObj) + "\n```";
            setDataMessages(prev => [...prev, { role: "system_info", content: metaDebugStr }]);

            setLoadingState("analyzing"); 

            const privacyPromptExtension = privacyMode === 'strict' 
            ? `\n【数据护盾激活声明（极其重要）】\n当前提供的数据已开启严格隐私模式：\n1. 敏感文本词汇已按列名进行脱敏映射（如将具体名称映射为"部门_001"）。\n2. **所有财务金额、成本、销量等绝对数值均已被统一按未知标量混淆缩放！**\n你可以精确地计算和分析占比、排名、同比/环比增速等相对指标，但绝对值已无任何现实意义。\n**强制要求：在你的文字报告和分析中，只允许输出相对分析结果（如百分比、增幅、相对排名），严禁出现具体的绝对数值金额！绝不允许使用“百亿”、“千万”等词汇臆测业务体量！**\n` 
            : (privacyMode === 'semi_text' || privacyMode === 'full_text') 
            ? `\n【数据护盾激活声明】\n当前提供的数据已开启文本隐私模式：敏感文本已按列名进行安全映射（如将具体名称映射为"部门_001"）。请直接使用这些映射后的代号进行分析。\n` 
            : "";

            // 🌟 护栏逻辑注入
            const domainRestrictionPrompt = chatProps.restrictDomain 
            ? `\n【业务领域限制（强制）】：你是一个专属于当前数据分析的 AI 助手。如果用户的提问完全脱离了零售、数据分析或当前提供的数据上下文（例如日常闲聊、询问天气、要求写无关代码等），请礼貌地拒绝，并说明你只能回答与当前业务数据相关的分析问题。\n`
            : "";

            // 🌟 提示词作用域隔离：如果不是快捷指令，才追加自定义的 rules
            const appliedCustomRules = (!isQuickCommand && chatProps.customSystemPrompt) 
                ? `\n${chatProps.customSystemPrompt}\n` 
                : "";

            const finalSystemPrompt = `${chatProps.baseSystemPrompt}${domainRestrictionPrompt}${privacyPromptExtension}${appliedCustomRules}

【动态交互与数据真理声明】
你当前运行在 Power BI 仪表板中，用户可以通过切片器动态改变数据。请遵循以下高级原则：
1. 保持记忆：请维持与用户的对话连贯性，记住你们正在讨论的业务逻辑和分析脉络。
2. 数据唯一真理：当涉及具体的门店数、销售额、报表行数等事实计算时，**必须且只能以本次下方提供的最新数据快照为准！**
3. 拥抱变化：如果你发现下方的新数据与你在历史对话中的统计结论产生冲突，属于正常现象。

### 当前为您准备的最新动态业务数据快照：
${optimizedDataString}`;

            let finalApiMessages = [
                { role: "system", content: finalSystemPrompt },
                ...newMessages.filter(m => m.role === "user" || m.role === "assistant").map(m => ({
                    role: m.role, content: m.content === displayMessage ? secureUserPrompt : m.content
                }))
            ];

            if (privacyMode !== 'off' && dataDictionary) {
                finalApiMessages = finalApiMessages.map(msg => {
                    let safeContent = String(msg.content);
                    dataDictionary.sortedRealVals.forEach(realVal => {
                        if (safeContent.includes(realVal)) {
                            safeContent = safeContent.split(realVal).join(dataDictionary.maskingMap[realVal]);
                        }
                    });
                    return { ...msg, content: safeContent };
                });
            }

            const finalResponse = await fetch(endpoint, {
                method: "POST", headers: fetchHeaders,
                body: JSON.stringify({ 
                    model: chatProps.modelName, 
                    messages: finalApiMessages, 
                    temperature: 0.7, 
                    stream: false 
                })
            });

            if (!finalResponse.ok) {
                const errorData = await finalResponse.json().catch(() => ({}));
                throw new Error(`HTTP ${finalResponse.status} - ${errorData.error?.message || "未知错误"}`);
            }

            const data = await finalResponse.json();
            if (data.error) throw new Error(data.error.message || "API 拒绝了请求");
            
            let fullContent = data.choices?.[0]?.message?.content || "";
            
            if (privacyMode !== 'off' && dataDictionary) {
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
            const daxSystemPrompt = `你是一位专业的 Microsoft Power BI DAX 专家。\n你的任务是根据用户提供的【模型结构字典】和需求，编写精准、性能极佳的 DAX 度量值或计算列公式。\n\n【绝对强制规则】：\n1. 【零幻觉】：你写在公式里的所有表名、列名、已有度量值，**必须 100% 存在于下方的模型字典中**。\n2. 【表间关系感知】：观察字典中的【表间关系】部分。如果逻辑跨越多张表，且关系是 "未激活(需USERELATIONSHIP)"，必须在 CALCULATE 中使用 USERELATIONSHIP 激活。\n3. 【数据类型与日期防错】：优先使用最安全的 DAX 原生时间函数直接作用于精确到天的日期列。例如：YEAR('Date'[Date]) = 2021 && MONTH('Date'[Date]) = 2。\n4. 【代码格式约束】：所有的 DAX 代码必须且只能包裹在标准的 Markdown 代码块中，语言指定为 dax。\n5. 【解释简明】：给出代码后，用简短专业的中文解释这层 DAX 的计算逻辑（不要超过 3 句话）。\n\n### 用户的当前模型结构字典如下：\n${modelDictionary}`;

            const apiMessages = [
                { role: "system", content: daxSystemPrompt },
                ...newDaxMessages.filter(m => m.role === "user" || m.role === "assistant").map(m => ({
                    role: m.role, content: m.content
                }))
            ];

            const response = await fetch(endpoint, {
                method: "POST", headers: fetchHeaders,
                body: JSON.stringify({ 
                    model: chatProps.modelName, 
                    messages: apiMessages, 
                    temperature: 0.2, 
                    stream: false 
                })
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
        // 传递 true，表示这来自于快捷指令，剥离用户自定义系统提示词
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
            
            text = text.replace(/\x60\x60\x60chart[\s\S]*?\x60\x60\x60/g, (match) => {
                try {
                    const jsonString = match.replace(/\x60\x60\x60chart\n?/, '').replace(/\n?\x60\x60\x60/, '');
                    const chartConfig = JSON.parse(jsonString);
                    const data = chartConfig.data || [];
                    const activeSeries = chartConfig.series || [{ name: chartConfig.yAxisName || '数值', dataKey: 'value' }];
                    let tableHtml = `<div style="margin: 15px 0; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;"><div style="background-color: #f8fafc; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #334155; font-size: 13px;">附表：数据明细</div><table style="border-collapse: collapse; width: 100%; font-size: 13px; text-align: left;"><thead><tr><th style="border-bottom: 2px solid #e2e8f0; padding: 8px 12px; color: #64748b; background-color: #f8fafc;">${chartConfig.xAxisName || '维度'}</th>`;
                    activeSeries.forEach((s: any) => { tableHtml += `<th style="border-bottom: 2px solid #e2e8f0; padding: 8px 12px; text-align: right; color: #64748b; background-color: #f8fafc;">${s.name}</th>`; });
                    tableHtml += `</tr></thead><tbody>`;
                    data.forEach((item: any) => {
                        tableHtml += `<tr><td style="border-bottom: 1px solid #f1f5f9; padding: 8px 12px;">${item.name}</td>`;
                        activeSeries.forEach((s: any) => { tableHtml += `<td style="border-bottom: 1px solid #f1f5f9; padding: 8px 12px; text-align: right;">${item[s.dataKey] !== undefined ? item[s.dataKey] : '-'}</td>`; });
                        tableHtml += `</tr>`;
                    });
                    tableHtml += `</tbody></table></div>`;
                    return tableHtml;
                } catch(e) { return '<div style="color:gray; font-style:italic;">[图表数据导出失败]</div>'; }
            });

            text = text.replace(/^### (.*$)/gim, `<h4 style="color: ${chatProps.themeColor}; margin: 16px 0 8px 0; font-size: 15px;">$1</h4>`);
            text = text.replace(/^## (.*$)/gim, `<h3 style="color: #1e293b; margin: 18px 0 10px 0; font-size: 16px;">$1</h3>`);
            text = text.replace(/^# (.*$)/gim, `<h2 style="color: #0f172a; margin: 20px 0 12px 0; font-size: 18px;">$1</h2>`);
            text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            text = text.replace(/^[\*\-] (.*$)/gim, '<div style="margin-left: 20px; display: list-item; list-style-type: disc;">$1</div>');
            text = text.replace(/\n/g, '<br/>');
            text = text.replace(/<\/h4><br\/>/g, '</h4>');
            text = text.replace(/<\/h3><br\/>/g, '</h3>');
            text = text.replace(/<\/h2><br\/>/g, '</h2>');
            text = text.replace(/<\/div><br\/>/g, '</div>');
            htmlContent += `<div style="line-height: 1.6; font-size: 14px; color: #333;">${text}</div></div>`;
        });
        htmlContent += `</div>`;

        let copySuccess = false;
        const copyHandler = (e: ClipboardEvent) => { if (e.clipboardData) { e.clipboardData.setData('text/html', htmlContent); e.clipboardData.setData('text/plain', plainTextFallback); e.preventDefault(); } };
        try {
            const textArea = document.createElement("textarea"); textArea.value = "dummy"; textArea.style.position = "fixed"; textArea.style.left = "-9999px"; 
            document.body.appendChild(textArea); textArea.select();
            document.addEventListener('copy', copyHandler); copySuccess = document.execCommand('copy'); document.removeEventListener('copy', copyHandler);
            document.body.removeChild(textArea);
        } catch (e) { console.error("复制失败:", e); }
        if (copySuccess) showToast("排版复制成功"); else showToast("复制失败，请检查安全权限");
    };

    const renderScriptModal = () => {
        if (!showScriptModal) return null;
        const isTE = showScriptModal === "TE";
        const title = isTE ? "Tabular Editor 提取脚本" : "DAX Studio 提取脚本";
        
        const scriptCodeTE = `var sb = new System.Text.StringBuilder();\nforeach(var t in Model.Tables) {\n    if(t.Name.StartsWith("LocalDateTable") || t.Name.StartsWith("DateTableTemplate")) continue;\n    sb.AppendLine("【表】: '" + t.Name + "'");\n    var colInfo = t.Columns.Select(c => {\n        string type = c.DataType.ToString().Replace("System.", "");\n        string format = !string.IsNullOrEmpty(c.FormatString) ? "|格式:" + c.FormatString : "";\n        return c.Name + "(" + type + format + ")";\n    });\n    sb.AppendLine("包含列: " + string.Join(", ", colInfo));\n    var ms = t.Measures.Select(m => m.Name).ToList();\n    if(ms.Count > 0) sb.AppendLine("度量值: " + string.Join(", ", ms));\n    sb.AppendLine("");\n}\nsb.AppendLine("【表间关系】");\nforeach(var r in Model.Relationships) {\n    string isActive = r.IsActive ? "已激活" : "未激活(需USERELATIONSHIP)";\n    sb.AppendLine("'" + r.FromTable.Name + "'[" + r.FromColumn.Name + "] ---> '" + r.ToTable.Name + "'[" + r.ToColumn.Name + "] (状态: " + isActive + ")");\n}\nSystem.Windows.Forms.Clipboard.SetText(sb.ToString());`;
        const scriptCodeDAX = `DEFINE\n    VAR _Tables = SELECTCOLUMNS(INFO.TABLES(), "TableID", [ID], "TableName", [Name])\n    VAR _Columns = SELECTCOLUMNS(FILTER(INFO.COLUMNS(), [Type] IN {1, 2, 4}), "TableID", [TableID], "ColumnID", [ID], "ColName", COALESCE([ExplicitName], [InferredName]), "ObjectName", COALESCE([ExplicitName], [InferredName]) & "(" & SWITCH(COALESCE([ExplicitDataType], [InferredDataType]), 2, "String", 6, "Int", 8, "Double", 9, "Date", 10, "Decimal", 11, "Bool", "Any") & ")")\n    VAR _Measures = SELECTCOLUMNS(INFO.MEASURES(), "TableID", [TableID], "ObjectName", "[" & [Name] & "](度量值)")\n    VAR _Objects = UNION(SELECTCOLUMNS(_Columns, "TableID", [TableID], "ObjectName", [ObjectName]), _Measures)\n    VAR _Combined = NATURALINNERJOIN(_Tables, _Objects)\n    VAR _TableSchemaRaw = ADDCOLUMNS(_Tables, "DictStr", VAR currentTable = [TableName] VAR objects = FILTER(_Combined, [TableName] = currentTable && NOT(LEFT(currentTable, 14) = "LocalDateTable") && NOT(LEFT(currentTable, 17) = "DateTableTemplate")) RETURN IF(COUNTROWS(objects) > 0, "【表】: '" & currentTable & "' | 包含字段与度量值: " & CONCATENATEX(objects, [ObjectName], ", ")))\n    VAR _TableSchema = SELECTCOLUMNS(FILTER(_TableSchemaRaw, NOT ISBLANK([DictStr])), "AI_Model_Dictionary", [DictStr])\n    VAR _RelsRaw = ADDCOLUMNS(INFO.RELATIONSHIPS(), "DictStr", VAR fTblID = [FromTableID] VAR fColID = [FromColumnID] VAR tTblID = [ToTableID] VAR tColID = [ToColumnID] VAR isActive = IF([IsActive], "已激活", "未激活(需USERELATIONSHIP)") VAR fTblName = MAXX(FILTER(_Tables, [TableID] = fTblID), [TableName]) VAR fColName = MAXX(FILTER(_Columns, [TableID] = fTblID && [ColumnID] = fColID), [ColName]) VAR tTblName = MAXX(FILTER(_Tables, [TableID] = tTblID), [TableName]) VAR tColName = MAXX(FILTER(_Columns, [TableID] = tTblID && [ColumnID] = tColID), [ColName]) RETURN IF(NOT(LEFT(fTblName, 14) = "LocalDateTable") && NOT(LEFT(tTblName, 14) = "LocalDateTable") && NOT(ISBLANK(fTblName)), "【表间关系】: '" & fTblName & "'[" & fColName & "] ---> '" & tTblName & "'[" & tColName & "] (状态: " & isActive & ")"))\n    VAR _Rels = SELECTCOLUMNS(FILTER(_RelsRaw, NOT ISBLANK([DictStr])), "AI_Model_Dictionary", [DictStr])\nEVALUATE UNION(_TableSchema, _Rels)`;
        const scriptCode = isTE ? scriptCodeTE : scriptCodeDAX;

        return (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <div style={{ width: '85%', backgroundColor: 'white', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
                    <h3 style={{ margin: 0, color: '#334155' }}>{title}</h3>
                    <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>
                        {isTE ? "在 Tabular Editor 的 C# Script 窗口粘贴代码并按 F5，模型字典会自动复制到您的剪贴板。" : "在 DAX Studio 粘贴并运行(F5)，将底部 Results 面板的 AI_Model_Dictionary 列复制出来。"}
                    </p>
                    <textarea readOnly value={scriptCode} style={{ width: '100%', height: '140px', fontSize: '12px', fontFamily: 'monospace', padding: '10px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', boxSizing: 'border-box' }} />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                        <button onClick={() => setShowScriptModal(null)} style={{ padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', backgroundColor: '#e2e8f0', color: '#475569', fontWeight: 'bold' }}>关闭</button>
                        <button onClick={() => copyTextToClipboard(scriptCode, "提取脚本已复制到剪贴板")} style={{ padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', backgroundColor: chatProps.themeColor, color: 'white', fontWeight: 'bold' }}>一键复制代码</button>
                    </div>
                </div>
            </div>
        );
    };

    if (!showDataTab && !showDaxTab) {
        return (
            <div className="chat-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' }}>
                <div style={{ fontSize: '50px', marginBottom: '15px' }}>模块未启用</div>
                <h3 style={{ color: '#334155', margin: '0 0 10px 0', fontSize: '18px' }}>未启用任何分析模块</h3>
                <p style={{ color: '#64748b', fontSize: '13px', textAlign: 'center', maxWidth: '80%', lineHeight: 1.6 }}>
                    请在视觉对象格式面板中，开启所需功能。
                </p>
            </div>
        );
    }

    const currentMessages = activeMode === "data" ? dataMessages : daxMessages;
    const currentInput = activeMode === "data" ? dataInputValue : daxInputValue;
    const setCurrentInput = activeMode === "data" ? setDataInputValue : setDaxInputValue;

    const renderPrivacyDescription = () => {
        switch (privacyMode) {
            case 'off':
                return "全明文传输。适用于企业内网或公开测试数据，大模型理解度最高。";
            case 'semi_text':
                return "关键实体屏蔽。仅对门店、客商等敏感主数据按列名编码（如:门店_001），保留商品品类等业务维度，平衡分析深度与数据合规。";
            case 'full_text':
                return "全维编码。所有非数值文本转化为带有列名含义的代号（如:四级分类_001），防范维度组合泄露，模型仅基于结构特征进行输出。";
            case 'strict':
                return "高密模式。文本全映射加密，且核心指标已按未知随机标量混淆。注：受混淆影响，AI生成的文字报告中不包含具体的绝对金额求和，主要为您提供结构洞察（占比、排名、增速），明细数字请以本地源视图表为准。";
        }
    };

    return (
        <div className="chat-container" style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* 🌟 核心突破：注入全局抗模糊防拉伸样式，对抗 Power BI iframe 缩放机制 */}
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
                        <button 
                            onClick={() => setActiveMode("data")} 
                            style={{ 
                                flex: 1, padding: '12px 0', border: 'none', 
                                background: activeMode === 'data' ? 'white' : 'transparent', 
                                color: activeMode === 'data' ? chatProps.themeColor : 'rgba(255,255,255,0.85)', 
                                fontWeight: activeMode === 'data' ? 'bold' : 'normal', 
                                borderRadius: '10px 10px 0 0', cursor: 'pointer', transition: 'all 0.2s',
                                whiteSpace: 'nowrap', fontSize: '14px', letterSpacing: '1px', 
                                display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' 
                            }}>
                            数据洞察
                        </button>
                        <button 
                            onClick={() => setActiveMode("dax")} 
                            style={{ 
                                flex: 1, padding: '12px 0', border: 'none', 
                                background: activeMode === 'dax' ? 'white' : 'transparent', 
                                color: activeMode === 'dax' ? chatProps.themeColor : 'rgba(255,255,255,0.85)', 
                                fontWeight: activeMode === 'dax' ? 'bold' : 'normal', 
                                borderRadius: '10px 10px 0 0', cursor: 'pointer', transition: 'all 0.2s',
                                whiteSpace: 'nowrap', fontSize: '14px', letterSpacing: '1px',
                                display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px'
                            }}>
                            DAX 助手
                        </button>
                    </div>
                )}
            </div>

            {activeMode === "data" && (
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

                                {dynamicPrompts.length > 0 && (
                                    <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{ fontSize: '12px', color: '#64748b' }}>指令参考：</div>
                                        {dynamicPrompts.map((p, idx) => (
                                            <button key={idx} onClick={() => handleSendInput(p)} style={{ textAlign: 'left', padding: '8px 12px', backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', color: '#334155', transition: 'all 0.2s', ...{ ':hover': { backgroundColor: '#e2e8f0' } } as any }}>
                                                {p}
                                            </button>
                                        ))}
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
                            {loadingState === "routing" && <span>Agent 思考中：分析业务维度与指标需求...</span>}
                            {loadingState === "aggregating" && <span>Agent 执行中：本地聚合明细数据...</span>}
                            {loadingState === "analyzing" && <ThinkingAnimation themeColor={chatProps.themeColor} />}
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-area" style={{ borderTop: '1px solid #e2e8f0', padding: '12px 15px', backgroundColor: '#fff', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {activeMode === "data" && (
                        <>
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
                            </div>
                            <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: '1.4' }}>
                                {renderPrivacyDescription()}
                            </div>
                        </>
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