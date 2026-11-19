import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Bot, Check, ChevronDown, CircleStop, GitBranch, GitMerge, Hand, History, MessageSquareText, MousePointer2, Plus, Play, Send, ShieldCheck, Sparkles, Trash2, Workflow, X, Zap, ZoomIn, ZoomOut } from "lucide-react";
import { useStore } from "@/state/store";
import { runWorkflowGraph, validateWorkflowGraph, type WorkflowEdge, type WorkflowGraph, type WorkflowGraphResult, type WorkflowNode, type WorkflowNodeKind } from "@/lib/workflow-runner";
import { workflowFromGoal } from "@/lib/workflow-architect";
import { EmptyState } from "./states";

const GRAPH_KEY = "markbot.workflow.graph.v2";
const RUNS_KEY = "markbot.workflow.runs.v2";
const VERSIONS_KEY = "markbot.workflow.versions.v2";
const NODE_WIDTH = 248;
const NODE_HEIGHT = 116;
const kinds: Array<{ kind: WorkflowNodeKind; label: string; description: string }> = [
  { kind: "prompt", label: "提示词", description: "整理或补充输入内容" },
  { kind: "agent", label: "助手", description: "交给指定助手执行" },
  { kind: "condition", label: "条件分支", description: "按内容走“是/否”分支" },
  { kind: "approval", label: "人工审批", description: "暂停并等待确认" },
  { kind: "parallel", label: "并行分叉", description: "同时派出多条分支（连两个以上节点）" },
  { kind: "join", label: "汇合", description: "等所有分支跑完，合并结果（接两个以上输入）" },
  { kind: "output", label: "输出", description: "标记流程最终结果" },
];
const icons: Record<WorkflowNodeKind, typeof Bot> = { trigger: Zap, prompt: MessageSquareText, agent: Bot, condition: GitBranch, approval: ShieldCheck, parallel: Workflow, join: GitMerge, output: Send };
const labels: Record<WorkflowNodeKind, string> = { trigger: "手动触发", prompt: "提示词", agent: "助手", condition: "条件分支", approval: "人工审批", parallel: "并行分叉", join: "汇合", output: "输出" };

function initialGraph(): WorkflowGraph {
  const trigger = crypto.randomUUID();
  return { title: "未命名工作流", nodes: [{ id: trigger, kind: "trigger", x: 100, y: 260, title: "手动触发" }], edges: [] };
}

function readJson<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; } catch { return fallback; }
}

function curve(from: WorkflowNode, to: WorkflowNode): string {
  const x1 = from.x + NODE_WIDTH;
  const y1 = from.y + NODE_HEIGHT / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_HEIGHT / 2;
  const bend = Math.max(70, Math.abs(x2 - x1) * .45);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

export function WorkflowCanvasPage() {
  const { state } = useStore();
  const bots = state.bots.filter((bot) => !bot.hidden);
  const [graph, setGraph] = useState<WorkflowGraph>(() => readJson(GRAPH_KEY, initialGraph()));
  const [runs, setRuns] = useState<WorkflowGraphResult[]>(() => readJson(RUNS_KEY, []));
  const [versions, setVersions] = useState<WorkflowGraph[]>(() => readJson(VERSIONS_KEY, []));
  const [run, setRun] = useState<WorkflowGraphResult | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<{ from: string; branch?: "yes" | "no" } | null>(null);
  const [tool, setTool] = useState<"select" | "hand">("select");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [menu, setMenu] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [architectOpen, setArchitectOpen] = useState(false);
  const [goal, setGoal] = useState("");
  const [notice, setNotice] = useState("");
  const [approval, setApproval] = useState<{ node: WorkflowNode; input: string; decide: (approved: boolean) => void } | null>(null);
  const active = useRef<AbortController | null>(null);
  const drag = useRef<{ kind: "pan" | "node"; id?: string; x: number; y: number; startX: number; startY: number } | null>(null);
  const chosen = graph.nodes.find((node) => node.id === selected) ?? null;
  const resultByNode = useMemo(() => new Map(run?.nodes.map((entry) => [entry.id, entry])), [run]);

  useEffect(() => { localStorage.setItem(GRAPH_KEY, JSON.stringify(graph)); }, [graph]);
  useEffect(() => { localStorage.setItem(RUNS_KEY, JSON.stringify(runs)); }, [runs]);
  useEffect(() => { localStorage.setItem(VERSIONS_KEY, JSON.stringify(versions)); }, [versions]);
  useEffect(() => () => active.current?.abort(), []);

  const updateNode = (id: string, patch: Partial<WorkflowNode>) => setGraph((before) => ({ ...before, nodes: before.nodes.map((node) => node.id === id ? { ...node, ...patch } : node) }));
  const addNode = (kind: WorkflowNodeKind) => {
    const source = graph.nodes.find((node) => node.id === selected) ?? graph.nodes.at(-1);
    const id = crypto.randomUUID();
    const node: WorkflowNode = { id, kind, title: labels[kind], x: (source?.x ?? 100) + 330, y: source?.y ?? 260, botId: kind === "agent" ? bots[0]?.id : undefined, text: kind === "agent" ? "请根据输入完成任务。" : kind === "prompt" ? "{{input}}" : undefined, rule: kind === "condition" ? "包含：完成" : undefined };
    const edge: WorkflowEdge | null = source ? { id: crypto.randomUUID(), from: source.id, to: id, branch: source.kind === "condition" ? "yes" : undefined } : null;
    setGraph((before) => ({ ...before, nodes: [...before.nodes, node], edges: edge ? [...before.edges, edge] : before.edges }));
    setSelected(id); setMenu(false); setNotice("");
  };
  const deleteNode = (id: string) => {
    const node = graph.nodes.find((entry) => entry.id === id);
    if (node?.kind === "trigger") { setNotice("触发器不能删除。每个工作流必须保留一个入口。"); return; }
    setGraph((before) => ({ ...before, nodes: before.nodes.filter((entry) => entry.id !== id), edges: before.edges.filter((edge) => edge.from !== id && edge.to !== id) }));
    setSelected(null);
  };
  const connectTo = (target: string) => {
    if (!connecting || connecting.from === target) return;
    const duplicate = graph.edges.some((edge) => edge.from === connecting.from && edge.to === target && edge.branch === connecting.branch);
    if (!duplicate) setGraph((before) => ({ ...before, edges: [...before.edges, { id: crypto.randomUUID(), from: connecting.from, to: target, branch: connecting.branch }] }));
    setConnecting(null);
  };
  const pointerDown = (event: PointerEvent<HTMLElement>, id?: string) => {
    if (event.button !== 0) return;
    const node = graph.nodes.find((entry) => entry.id === id);
    drag.current = { kind: node && tool === "select" ? "node" : "pan", id, x: event.clientX, y: event.clientY, startX: node?.x ?? pan.x, startY: node?.y ?? pan.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent<HTMLElement>) => {
    const value = drag.current;
    if (!value) return;
    const x = value.startX + (event.clientX - value.x) / (value.kind === "node" ? zoom : 1);
    const y = value.startY + (event.clientY - value.y) / (value.kind === "node" ? zoom : 1);
    if (value.kind === "node" && value.id) updateNode(value.id, { x, y }); else setPan({ x, y });
  };
  const runGraph = async () => {
    if (active.current) return;
    const error = validateWorkflowGraph(graph, new Set(bots.map((bot) => bot.id)));
    if (error) { setNotice(error); return; }
    setVersions((before) => [structuredClone(graph), ...before].slice(0, 20));
    const controller = new AbortController(); active.current = controller; setNotice("工作流正在执行。点击节点可查看实时结果。");
    try {
      const finished = await runWorkflowGraph(graph, { signal: controller.signal, onChange: setRun, approve: (node, input) => new Promise<boolean>((resolve) => setApproval({ node, input, decide: resolve })) });
      setRuns((before) => [finished, ...before].slice(0, 50));
      setNotice(finished.status === "done" ? "工作流执行完成。" : finished.status === "stopped" ? "工作流已停止。" : "工作流执行失败，点击红色节点查看原因。");
    } finally { active.current = null; }
  };

  const buildFromGoal = () => {
    if (!goal.trim()) { setNotice("请先描述想让 Agent 团队完成的目标。"); return; }
    setVersions((before) => [structuredClone(graph), ...before].slice(0, 20));
    setGraph(workflowFromGoal(goal, bots));
    setSelected(null);
    setArchitectOpen(false);
    setNotice("已根据目标生成总监—执行—审核—交付工作流。");
  };

  return <section aria-label="工作流画布" className="relative h-full w-full overflow-hidden bg-app text-ink">
    <div className="pointer-events-none absolute inset-0 opacity-80" style={{ backgroundImage: "radial-gradient(var(--color-hairline) 1px, transparent 1px)", backgroundSize: `${24 * zoom}px ${24 * zoom}px`, backgroundPosition: `${pan.x}px ${pan.y}px` }} />
    <header className="absolute inset-x-0 top-0 z-30 flex h-16 items-center border-b border-hairline/40 bg-panel px-4"><Workflow className="mr-2 text-accent" size={19}/><input aria-label="工作流名称" value={graph.title} onChange={(event) => setGraph({ ...graph, title: event.target.value })} className="w-56 bg-transparent text-sm font-semibold outline-none"/><span className="rounded-[4px] bg-control px-1.5 py-0.5 text-meta text-ink-tertiary tabular-nums">{graph.nodes.length} 个节点 · 自动保存</span><div className="ml-auto flex items-center gap-2"><button type="button" onClick={() => setArchitectOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent-text hover:bg-accent/15"><Sparkles size={15}/>AI 架构师</button><button type="button" onClick={() => setHistoryOpen((value) => !value)} className="flex items-center gap-1.5 rounded-control border border-hairline/50 px-3 py-2 text-sm hover:bg-raised"><History size={15}/>记录</button>{active.current && <button type="button" onClick={() => active.current?.abort()} className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-2 text-sm text-danger"><CircleStop size={15}/>停止</button>}<button type="button" disabled={Boolean(active.current)} onClick={() => void runGraph()} className="flex items-center gap-1.5 rounded-control bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"><Play size={15}/>运行</button></div></header>{architectOpen && <aside className="absolute bottom-4 right-4 top-20 z-50 flex w-[390px] flex-col rounded-panel border border-hairline/50 bg-panel p-5 shadow-xl"><div className="flex items-center gap-2"><span className="flex size-9 items-center justify-center rounded-xl bg-accent/10 text-accent-text"><Sparkles size={18}/></span><div><strong className="block">AI 工作流架构师</strong><span className="text-meta text-ink-tertiary">把业务目标转成可执行的 Agent 协作流程</span></div><button className="ml-auto rounded-control p-2 hover:bg-raised" onClick={() => setArchitectOpen(false)}><X size={16}/></button></div><div className="mt-5 rounded-card border border-hairline/50 bg-inset p-3 text-xs leading-5 text-ink-secondary">会自动识别总监、执行助手和审核助手，并在发布、上线或删除等高风险目标前加入人工审批。</div><label className="mt-5 text-xs text-ink-secondary">你想让团队完成什么？<textarea autoFocus rows={9} value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="例如：完成新功能开发，交给测试助手审核，通过后由 Mark 汇总，上线前等待我批准。" className="mt-2 w-full resize-none rounded-card border border-hairline/50 bg-inset p-3 text-sm leading-6 text-ink outline-none focus:border-accent"/></label><div className="mt-4 grid grid-cols-2 gap-2 text-meta text-ink-tertiary"><span className="rounded-control bg-inset p-2">· 自动选择助手</span><span className="rounded-control bg-inset p-2">· 自动生成分支</span><span className="rounded-control bg-inset p-2">· 审核不通过分流</span><span className="rounded-control bg-inset p-2">· 高风险人工审批</span></div><button type="button" onClick={buildFromGoal} className="mt-auto flex items-center justify-center gap-2 rounded-card bg-accent px-4 py-3 text-sm font-medium text-white"><Sparkles size={16}/>生成可执行工作流</button></aside>}

    <div className="absolute inset-x-0 bottom-0 top-16 touch-none" onPointerDown={(event) => { if (event.target === event.currentTarget) setSelected(null); pointerDown(event); }} onPointerMove={pointerMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}><div className="absolute left-0 top-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}><svg className="pointer-events-none absolute overflow-visible" width="1" height="1" aria-hidden="true">{graph.edges.map((edge) => { const from = graph.nodes.find((node) => node.id === edge.from); const to = graph.nodes.find((node) => node.id === edge.to); return from && to ? <g key={edge.id}><path d={curve(from, to)} fill="none" stroke={edge.branch === "no" ? "var(--color-danger)" : edge.branch === "yes" ? "var(--color-success)" : "var(--color-accent)"} strokeWidth="2.5"/><text x={(from.x + NODE_WIDTH + to.x) / 2} y={(from.y + to.y) / 2 + 48} fill="var(--color-ink-secondary)" fontSize="11">{edge.branch === "yes" ? "是" : edge.branch === "no" ? "否" : ""}</text></g> : null; })}</svg>{graph.nodes.map((node) => { const Icon = icons[node.kind]; const status = resultByNode.get(node.id); const botName = bots.find((bot) => bot.id === node.botId)?.name; return <article key={node.id} onPointerDown={(event) => { event.stopPropagation(); if (connecting) { connectTo(node.id); return; } setSelected(node.id); pointerDown(event, node.id); }} className={`absolute h-[116px] w-[248px] cursor-grab rounded-card border bg-card p-4 shadow-lg transition-colors active:cursor-grabbing ${selected === node.id ? "border-accent" : status?.stage === "failed" ? "border-danger" : status?.stage === "running" ? "border-warning" : status?.stage === "done" ? "border-success/70" : "border-hairline/50"}`} style={{ left: node.x, top: node.y }}><div className="flex items-center gap-2"><span className="flex size-9 items-center justify-center rounded-xl bg-accent/10 text-accent-text"><Icon size={18}/></span><div className="min-w-0"><strong className="block truncate text-sm">{node.title}</strong><span className="text-meta text-ink-tertiary">{labels[node.kind]}{botName ? ` · ${botName}` : ""}</span></div><span className="ml-auto text-tiny text-ink-tertiary">{status?.stage === "running" ? "执行中" : status?.stage === "approval" ? "待审批" : status?.stage === "done" ? "完成" : status?.stage === "failed" ? "失败" : ""}</span></div><p className="mt-3 line-clamp-2 text-xs leading-4 text-ink-secondary">{node.kind === "condition" ? node.rule : node.text || (node.kind === "approval" ? "等待人工确认后继续" : node.kind === "parallel" ? "所有出边同时执行" : node.kind === "join" ? "等分支全部完成后合并结果" : node.kind === "output" ? "汇总并展示最终结果" : "点击运行工作流")}</p></article>; })}</div></div>

    <div className="absolute bottom-4 left-4 z-30 flex items-center gap-2 rounded-card border border-hairline/50 bg-card p-2 text-xs shadow-lg"><button aria-label="缩小" onClick={() => setZoom((value) => Math.max(.4, +(value - .1).toFixed(1)))}><ZoomOut size={16}/></button><span className="w-10 text-center">{Math.round(zoom * 100)}%</span><button aria-label="放大" onClick={() => setZoom((value) => Math.min(1.8, +(value + .1).toFixed(1)))}><ZoomIn size={16}/></button><button className="border-l border-hairline/50 pl-2" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>复位</button></div>
    <div className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-panel border border-hairline/50 bg-card p-2 shadow-xl"><button aria-label="选择" onClick={() => setTool("select")} className={`rounded-lg p-2 ${tool === "select" ? "bg-raised" : ""}`}><MousePointer2 size={18}/></button><button aria-label="拖动画布" onClick={() => setTool("hand")} className={`rounded-lg p-2 ${tool === "hand" ? "bg-raised" : ""}`}><Hand size={18}/></button><div className="relative ml-2"><button onClick={() => setMenu((value) => !value)} className="flex items-center gap-1.5 rounded-control bg-accent px-3 py-2 text-sm font-medium text-white"><Plus size={16}/>添加节点<ChevronDown size={14}/></button>{menu && <div className="absolute bottom-12 left-0 w-64 rounded-card border border-hairline/50 bg-menu p-2 shadow-xl">{kinds.map((item) => { const Icon = icons[item.kind]; return <button key={item.kind} onClick={() => addNode(item.kind)} className="flex w-full items-center gap-3 rounded-lg p-2.5 text-left hover:bg-menu-hover"><Icon size={17} className="text-accent-text"/><span><strong className="block text-sm">{item.label}</strong><small className="text-ink-tertiary">{item.description}</small></span></button>; })}</div>}</div></div>

    {chosen && <aside className="absolute bottom-20 left-4 top-20 z-40 w-[320px] overflow-y-auto rounded-panel border border-hairline/50 bg-panel p-4 shadow-xl"><div className="mb-5 flex items-center"><strong>{labels[chosen.kind]}设置</strong><button className="ml-auto rounded-lg p-2 text-danger hover:bg-raised" onClick={() => deleteNode(chosen.id)}><Trash2 size={16}/></button><button className="rounded-lg p-2 hover:bg-raised" onClick={() => setSelected(null)}><X size={16}/></button></div><label className="block text-xs text-ink-secondary">节点名称<input value={chosen.title} onChange={(event) => updateNode(chosen.id, { title: event.target.value })} className="mt-2 w-full rounded-lg border border-hairline/50 bg-inset p-2.5 text-sm outline-none focus:border-accent"/></label>{chosen.kind === "agent" && <label className="mt-4 block text-xs text-ink-secondary">执行助手<select value={chosen.botId ?? ""} onChange={(event) => updateNode(chosen.id, { botId: event.target.value })} className="mt-2 w-full rounded-lg border border-hairline/50 bg-inset p-2.5 text-sm">{bots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}</select></label>}{(chosen.kind === "agent" || chosen.kind === "prompt") && <label className="mt-4 block text-xs text-ink-secondary">{chosen.kind === "agent" ? "交办任务" : "提示词模板"}<textarea rows={7} value={chosen.text ?? ""} onChange={(event) => updateNode(chosen.id, { text: event.target.value })} placeholder="使用 {{input}} 插入上一步结果" className="mt-2 w-full resize-y rounded-lg border border-hairline/50 bg-inset p-2.5 text-sm leading-5 outline-none focus:border-accent"/><span className="mt-1 block text-meta text-ink-tertiary">支持用 {"{{input}}"} 精确放置上一步结果。</span></label>}{chosen.kind === "condition" && <label className="mt-4 block text-xs text-ink-secondary">判断规则<input value={chosen.rule ?? ""} onChange={(event) => updateNode(chosen.id, { rule: event.target.value })} placeholder="包含：通过" className="mt-2 w-full rounded-lg border border-hairline/50 bg-inset p-2.5 text-sm outline-none focus:border-accent"/><span className="mt-1 block text-meta leading-4 text-ink-tertiary">支持“包含：文字”“不包含：文字”“等于：文字”。</span></label>}<div className="mt-5 border-t border-hairline/40 pt-4"><strong className="text-xs text-ink-secondary">连接到下一节点</strong><div className="mt-2 flex gap-2">{chosen.kind === "condition" ? <><button onClick={() => { setConnecting({ from: chosen.id, branch: "yes" }); setSelected(null); }} className="flex-1 rounded-lg border border-success/40 p-2 text-xs text-success">连接“是”</button><button onClick={() => { setConnecting({ from: chosen.id, branch: "no" }); setSelected(null); }} className="flex-1 rounded-lg border border-danger/40 p-2 text-xs text-danger">连接“否”</button></> : <button onClick={() => { setConnecting({ from: chosen.id }); setSelected(null); }} className="w-full rounded-lg border border-accent/40 p-2 text-xs text-accent-text">选择目标节点</button>}</div>{graph.edges.filter((edge) => edge.from === chosen.id || edge.to === chosen.id).map((edge) => <div key={edge.id} className="mt-2 flex items-center gap-2 rounded-control bg-inset px-2 py-1.5 text-meta"><span className="truncate">{graph.nodes.find((node) => node.id === edge.from)?.title} → {graph.nodes.find((node) => node.id === edge.to)?.title}{edge.branch ? `（${edge.branch === "yes" ? "是" : "否"}）` : ""}</span><button className="ml-auto text-danger" onClick={() => setGraph((before) => ({ ...before, edges: before.edges.filter((item) => item.id !== edge.id) }))}><X size={13}/></button></div>)}</div>{resultByNode.get(chosen.id)?.output && <div className="mt-4 rounded-card border border-success/30 bg-success/10 p-3 text-xs"><strong className="text-success">执行结果</strong><p className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap leading-5 text-ink-secondary">{resultByNode.get(chosen.id)?.output}</p></div>}{resultByNode.get(chosen.id)?.error && <p className="mt-4 rounded-control bg-danger/10 p-3 text-xs text-danger">{resultByNode.get(chosen.id)?.error}</p>}</aside>}

    {connecting && <div className="absolute left-1/2 top-20 z-50 -translate-x-1/2 rounded-card border border-accent/40 bg-raised px-4 py-2 text-sm shadow-lg">点击一个节点完成连接 <button onClick={() => setConnecting(null)} className="ml-2 text-ink-secondary hover:text-ink">取消</button></div>}
    {approval && <div className="absolute inset-0 z-[70] grid place-items-center bg-black/55"><div className="w-[520px] max-w-[90vw] rounded-panel border border-hairline/50 bg-panel p-6 shadow-xl"><ShieldCheck className="text-warning"/><h2 className="mt-3 text-lg font-semibold">{approval.node.title}</h2><p className="mt-1 text-sm text-ink-secondary">工作流已暂停，等待你决定是否继续。</p><pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-card bg-inset p-4 text-xs leading-5 text-ink-secondary">{approval.input || "（没有上一步输出）"}</pre><div className="mt-5 flex justify-end gap-2"><button onClick={() => { approval.decide(false); setApproval(null); }} className="flex items-center gap-1 rounded-lg border border-danger/30 px-4 py-2 text-sm text-danger"><X size={15}/>拒绝</button><button onClick={() => { approval.decide(true); setApproval(null); }} className="flex items-center gap-1 rounded-control bg-accent px-4 py-2 text-sm font-medium text-white"><Check size={15}/>批准并继续</button></div></div></div>}
    {historyOpen && <aside className="absolute bottom-4 right-4 top-20 z-50 w-[340px] overflow-y-auto rounded-panel border border-hairline/50 bg-panel p-4 shadow-xl"><div className="flex items-center"><strong>运行与版本记录</strong><button className="ml-auto p-2" onClick={() => setHistoryOpen(false)}><X size={16}/></button></div><h3 className="mt-5 text-xs text-ink-tertiary">最近运行</h3>{runs.length ? runs.map((item) => <button key={item.id} onClick={() => setRun(item)} className="mt-2 block w-full rounded-control bg-inset p-3 text-left text-xs hover:bg-raised"><span>{new Date(item.startedAt).toLocaleString()}</span><span className="float-right">{item.status === "done" ? "完成" : item.status === "failed" ? "失败" : "已停止"}</span></button>) : <EmptyState data-workflow-runs-empty className="py-6" title="还没有运行记录" hint="点右上角「运行」跑一次，这里就会留下结果。" />}<h3 className="mt-6 text-xs text-ink-tertiary">运行前版本</h3>{versions.map((item, index) => <button key={index} onClick={() => { setGraph(structuredClone(item)); setHistoryOpen(false); setNotice("已恢复所选版本。"); }} className="mt-2 block w-full rounded-control bg-inset p-3 text-left text-xs hover:bg-raised">版本 {versions.length - index} · {item.nodes.length} 个节点</button>)}</aside>}
    {notice && <div role="status" className="absolute bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-card border border-hairline/50 bg-raised px-4 py-2 text-sm shadow-lg">{notice}</div>}
  </section>;
}
