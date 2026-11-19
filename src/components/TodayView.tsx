import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, Bot as BotIcon, CheckCircle2, Clock3, FolderOpen, LayoutGrid, Network, Play, SendHorizontal, ShieldCheck, Smartphone, Sparkles, Users, Wifi, WifiOff, Workflow } from "lucide-react";

import { useStore, type Bot, type Task } from "@/state/store";
import { cn } from "@/lib/cn";
import { cockpitCounts, cockpitProjects, type CockpitTaskState } from "@/lib/cockpit";
import { BotAvatar } from "./Avatar";
import { usePhones } from "@/lib/phones";
import { phonePairingSettingsAction } from "@/lib/phone-pairing";
import { MissionPanel } from "./MissionPanel";
import { CockpitWorkspace } from "./CockpitWorkspace";
import { KanbanBoard } from "./KanbanBoard";
import { ProviderStatusOverview } from "./ProviderStatusCard";
import { createDefaultRegistry, type RegisteredWidget } from "@/lib/slots";

const stateStyle: Record<CockpitTaskState, { label: string; dot: string; badge: string }> = {
  "needs-you": { label: "等待你", dot: "bg-danger", badge: "bg-danger/10 text-danger" },
  running: { label: "执行中", dot: "bg-accent", badge: "bg-accent/10 text-accent" },
  review: { label: "待审核", dot: "bg-warning", badge: "bg-warning/10 text-warning" },
  done: { label: "已完成", dot: "bg-success", badge: "bg-success/10 text-success" },
};

function openTask(dispatch: ReturnType<typeof useStore>["dispatch"], bot: Bot, task: Task) {
  dispatch({ type: "switchTask", botId: bot.id, threadId: task.threadId });
}

export function TodayView() {
  const { state, dispatch } = useStore();
  const projects = cockpitProjects(state.bots);
  const counts = cockpitCounts(projects);
  const enginesDown = state.instances.filter((instance) => instance.snapshot.state !== "available");
  const chiefs = useMemo(() => projects.flatMap((project) => project.lead ? [project.lead] : []), [projects]);
  const [chiefId, setChiefId] = useState("");
  const [brief, setBrief] = useState("");
  const [workspaceMode, setWorkspaceMode] = useState(false);
  const registry = useMemo(() => createDefaultRegistry(), []);
  const { phase: phonesPhase, phones } = usePhones();
  const selectedChief = chiefs.find((chief) => chief.id === chiefId) ?? chiefs[0];
  const onlinePhones = phones.filter((phone) => phone.online);
  const missionAgents = useMemo(() => state.bots.filter((bot) => !bot.hidden).map((bot) => ({ id: bot.id, name: bot.name })), [state.bots]);
  const dispatchBrief = () => {
    const text = brief.trim();
    if (!text || !selectedChief) return;
    dispatch({ type: "send", botId: selectedChief.id, threadId: selectedChief.threadId, text, mode: "goal" });
    setBrief("");
  };

  const renderWorkspaceWidget = (widget: RegisteredWidget): ReactNode => {
    switch (widget.id) {
      case "director":
        return <div className="flex items-end gap-2 rounded-2xl border border-hairline/60 bg-app/70 p-2">
          <textarea value={brief} onChange={(event) => setBrief(event.target.value)} rows={2} disabled={!selectedChief}
            placeholder={selectedChief ? `告诉 ${selectedChief.name} 要完成什么…` : "请先建立一名总监 Agent"}
            className="min-h-14 flex-1 resize-none bg-transparent px-2 py-1.5 text-ui leading-5 text-ink outline-none placeholder:text-ink-tertiary" />
          <button type="button" onClick={dispatchBrief} disabled={!selectedChief || !brief.trim()} aria-label="下达目标"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white disabled:opacity-35"><SendHorizontal size={17} /></button>
        </div>;
      case "mission":
        return <MissionPanel chief={selectedChief} agents={missionAgents} />;
      case "kanban":
        return <KanbanBoard projects={projects} onOpenTask={(item) => openTask(dispatch, item.bot, item.task)} />;
      case "stats":
        return <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "活跃项目", value: counts.projects }, { label: "团队 Agent", value: counts.agents },
            { label: "正在执行", value: counts.running }, { label: "等待你", value: counts.needsYou },
          ].map((item) => <div key={item.label} className="rounded-xl bg-control/40 p-3">
            <div className="text-page font-semibold tabular-nums text-ink">{item.value}</div>
            <div className="mt-0.5 text-tiny text-ink-secondary">{item.label}</div>
          </div>)}
        </div>;
      case "devices":
        return <div className="space-y-2 text-meta text-ink-secondary">
          <div className="flex items-center gap-2">{onlinePhones.length ? <Wifi size={13} className="text-success" /> : <WifiOff size={13} />}{onlinePhones.length ? `${onlinePhones.length} 台设备在线` : "尚无在线手机"}</div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => dispatch(phonePairingSettingsAction())} className="rounded-lg bg-control px-2 py-1 text-ink hover:bg-raised">连接手机</button>
            <button type="button" onClick={() => dispatch({ type: "showFiles" })} className="rounded-lg bg-control px-2 py-1 text-ink hover:bg-raised">远程文件</button>
          </div>
        </div>;
      case "providers":
        return <ProviderStatusOverview instances={state.instances} />;
      default:
        return <p className="text-meta text-ink-tertiary">未注册的面板：{widget.id}</p>;
    }
  };

  return (
    <main className="relative flex h-full min-w-0 flex-1 flex-col overflow-y-auto bg-app">
      <div className="mx-auto w-full max-w-[1440px] px-5 py-6 lg:px-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-meta font-medium text-accent-text">
              <Sparkles size={13} /> Mark Bot Command Center
            </div>
            <h1 className="text-26 font-semibold tracking-tight text-ink">项目驾驶舱</h1>
            <p className="mt-1.5 max-w-2xl text-ui leading-5 text-ink-secondary">你只需和总监对接；项目进度、Agent 执行、审核与阻塞会在这里统一汇总。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setWorkspaceMode((value) => !value)} aria-pressed={workspaceMode}
              className={cn("flex h-9 items-center gap-2 rounded-xl border px-3 text-note font-medium", workspaceMode ? "border-accent bg-accent/10 text-accent" : "border-hairline bg-card text-ink hover:bg-control")}>
              <LayoutGrid size={15} /> {workspaceMode ? "返回默认视图" : "多面板工作台"}
            </button>
            <button type="button" onClick={() => dispatch({ type: "showTeamMap" })} className="flex h-9 items-center gap-2 rounded-xl border border-hairline bg-card px-3 text-note font-medium text-ink hover:bg-control">
              <Network size={15} /> 团队架构
            </button>
            <button type="button" onClick={() => dispatch({ type: "showRoutines", view: "list" })} className="flex h-9 items-center gap-2 rounded-xl bg-accent px-3.5 text-note font-semibold text-white shadow-sm hover:opacity-90">
              <Workflow size={15} /> 工作流与自动化
            </button>
          </div>
        </header>

        {workspaceMode ? (
          <div className="mb-6">
            <CockpitWorkspace projectKey={selectedChief?.id ?? "all"} registry={registry} renderWidget={renderWorkspaceWidget} />
          </div>
        ) : (
          <>
        <MissionPanel chief={selectedChief} agents={missionAgents} />

        <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "活跃项目", value: counts.projects, icon: Workflow, tone: "text-violet-500 bg-violet-500/10" },
            { label: "团队 Agent", value: counts.agents, icon: Users, tone: "text-sky-500 bg-sky-500/10" },
            { label: "正在执行", value: counts.running, icon: Play, tone: "text-accent bg-accent/10" },
            { label: "等待你处理", value: counts.needsYou, icon: AlertTriangle, tone: counts.needsYou ? "text-danger bg-danger/10" : "text-success bg-success/10" },
          ].map(({ label, value, icon: Icon, tone }) => (
            <article key={label} className="rounded-2xl border border-hairline/50 bg-card p-4 shadow-sm">
              <div className={cn("mb-4 flex size-8 items-center justify-center rounded-xl", tone)}><Icon size={16} /></div>
              <div className="text-h2 font-semibold tabular-nums text-ink">{value}</div>
              <div className="mt-0.5 text-meta text-ink-secondary">{label}</div>
            </article>
          ))}
        </section>

        <section className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.8fr)]">
          <article className="relative overflow-hidden rounded-3xl border border-accent/20 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-card)_96%,var(--color-accent)),var(--color-card))] p-5 shadow-sm">
            
            <div className="relative flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-accent text-white shadow-sm"><Sparkles size={18} /></span>
              <div className="min-w-0 flex-1">
                <h2 className="text-lead font-semibold text-ink">总监指令台</h2>
                <p className="mt-0.5 text-meta text-ink-secondary">直接下达目标，由总监拆解、派工、跟踪并汇总交付。</p>
              </div>
              {chiefs.length > 0 && <select aria-label="选择总监" value={selectedChief?.id ?? ""} onChange={(event) => setChiefId(event.target.value)} className="relative h-9 max-w-44 rounded-xl border border-hairline bg-card px-3 text-meta font-medium text-ink outline-none focus:border-accent">{chiefs.map((chief) => <option key={chief.id} value={chief.id}>{chief.name} · {chief.section || "团队"}</option>)}</select>}
            </div>
            <div className="relative mt-4 flex items-end gap-2 rounded-2xl border border-hairline/60 bg-app/80 p-2 shadow-inner">
              <textarea value={brief} onChange={(event) => setBrief(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); dispatchBrief(); } }} rows={2} placeholder={selectedChief ? `告诉 ${selectedChief.name} 要完成什么…` : "请先建立一名总监 Agent"} disabled={!selectedChief} className="min-h-14 flex-1 resize-none bg-transparent px-2 py-1.5 text-ui leading-5 text-ink outline-none placeholder:text-ink-tertiary disabled:opacity-50" />
              <button type="button" onClick={dispatchBrief} disabled={!selectedChief || !brief.trim()} className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white shadow-sm transition-transform hover:scale-105 disabled:opacity-35 disabled:hover:scale-100" aria-label="下达目标"><SendHorizontal size={17} /></button>
            </div>
          </article>

          <article className="rounded-3xl border border-hairline/50 bg-card p-5 shadow-sm">
            <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-500"><Smartphone size={18} /></span><div><h2 className="text-body font-semibold text-ink">跨设备工作台</h2><p className="mt-0.5 text-tiny text-ink-secondary">Anywhere 能力 · 手机查看、审批和继续任务</p></div></div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button type="button" onClick={() => dispatch(phonePairingSettingsAction())} className="rounded-xl bg-control/45 p-3 text-left hover:bg-control"><Smartphone size={15} className="text-sky-500"/><span className="mt-2 block text-meta font-medium text-ink">连接手机</span><span className="mt-0.5 block text-micro text-ink-secondary">{phonesPhase === "loading" ? "检查中" : `${phones.length} 台已配对`}</span></button>
              <button type="button" onClick={() => dispatch({ type: "showFiles" })} className="rounded-xl bg-control/45 p-3 text-left hover:bg-control"><FolderOpen size={15} className="text-violet-500"/><span className="mt-2 block text-meta font-medium text-ink">远程文件</span><span className="mt-0.5 block text-micro text-ink-secondary">浏览与预览</span></button>
              <button type="button" onClick={() => dispatch({ type: "showToday" })} className="rounded-xl bg-control/45 p-3 text-left hover:bg-control"><ShieldCheck size={15} className="text-success"/><span className="mt-2 block text-meta font-medium text-ink">远程审批</span><span className="mt-0.5 block text-micro text-ink-secondary">{counts.needsYou} 项待处理</span></button>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-hairline/40 px-3 py-2 text-tiny text-ink-secondary">{onlinePhones.length ? <Wifi size={13} className="text-success"/> : <WifiOff size={13}/>} {onlinePhones.length ? `${onlinePhones.length} 台设备在线，可跨设备接续` : "尚无在线手机，桌面任务仍会后台继续"}</div>
          </article>
        </section>

        {projects.length === 0 ? (
          <section className="flex min-h-[300px] flex-col items-center justify-center rounded-3xl border border-dashed border-hairline bg-card/50 text-center">
            <CheckCircle2 size={30} className="mb-3 text-accent" />
            <h2 className="text-lead font-semibold text-ink">建立你的第一支 Agent 团队</h2>
            <p className="mt-1 max-w-md text-note text-ink-secondary">创建一名总监和专业助手，就能在这里跟踪从派工到验收的完整过程。</p>
          </section>
        ) : (
          <section className="grid items-start gap-4 xl:grid-cols-2">
            {projects.map((project) => (
              <article key={project.key} className="overflow-hidden rounded-3xl border border-hairline/50 bg-card shadow-sm">
                <header className="flex items-center gap-3 border-b border-hairline/40 px-5 py-4">
                  {project.lead ? <BotAvatar bot={project.lead} size={42} motion="none" motionKey={0} animated={false} /> : <span className="flex size-[42px] items-center justify-center rounded-2xl bg-control"><BotIcon size={20} /></span>}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-lead font-semibold text-ink">{project.name}</h2>
                      <span className={cn("size-2 rounded-full", project.state === "needs-you" ? "bg-danger" : project.state === "running" ? "bg-accent" : "bg-success")} />
                    </div>
                    <p className="mt-0.5 truncate text-meta text-ink-secondary">{project.lead ? `总监：${project.lead.name}` : "尚未指定总监"} · {project.members.length} 名成员 · {project.tasks.length} 项任务</p>
                  </div>
                  <div className="flex -space-x-2">{project.members.slice(0, 4).map((member) => <div key={member.id} title={member.name} className="rounded-full border-2 border-card"><BotAvatar bot={member} size={26} motion="none" motionKey={0} animated={false} /></div>)}</div>
                </header>

                <div className="p-3">
                  {project.tasks.length === 0 ? <div className="flex h-24 items-center justify-center rounded-2xl bg-control/30 text-note text-ink-secondary">暂无项目任务</div> : (
                    <ul className="space-y-1">
                      {project.tasks.slice(0, 6).map(({ bot, task, state: taskState }) => {
                        const style = stateStyle[taskState];
                        return (
                          <li key={`${bot.id}:${task.threadId}`}>
                            <button type="button" onClick={() => openTask(dispatch, bot, task)} className="group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-control/50">
                              <span className={cn("size-2 shrink-0 rounded-full", style.dot)} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-note font-medium text-ink">{task.title || "未命名任务"}</span>
                                <span className="mt-0.5 block truncate text-tiny text-ink-secondary">{bot.name} · {task.modelSelection?.model || bot.modelSelection.model}</span>
                              </span>
                              <span className={cn("rounded-lg px-2 py-1 text-tiny font-medium", style.badge)}>{style.label}</span>
                              <ArrowRight size={14} className="text-ink-secondary opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 touch:opacity-100" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </article>
            ))}
          </section>
        )}
          </>
        )}

        {enginesDown.length > 0 && (
          <section className="mt-5 rounded-2xl border border-danger/20 bg-danger/5 p-4">
            <div className="flex items-center gap-2 text-note font-semibold text-danger"><AlertTriangle size={15} /> {enginesDown.length} 个 AI 引擎当前不可用</div>
            <div className="mt-2 flex flex-wrap gap-2">{enginesDown.map((engine) => <span key={engine.instanceId} className="rounded-lg bg-card px-2.5 py-1 text-tiny text-ink-secondary">{engine.displayName || engine.instanceId}</span>)}</div>
          </section>
        )}

        <footer className="mt-5 flex items-center gap-2 text-tiny text-ink-secondary"><Clock3 size={12} /> 状态会随 Agent 任务实时更新</footer>
      </div>
    </main>
  );
}
