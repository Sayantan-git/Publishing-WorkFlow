import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlow, Background, Handle, Position, MarkerType } from '@xyflow/react';
import { Activity, Archive, ArrowLeft, ArrowRight, BookOpen, CalendarClock, Check, CheckCircle2, ChevronDown, ChevronRight, CircleAlert, Clock, Database, FileWarning, GitBranch, Inbox, Info, KeyRound, Layers, List, Maximize2, Menu, Minimize2, Monitor, Moon, Network, Orbit, Pause, Play, RotateCcw, Search, Server, Shield, ShieldAlert, Store, Sun, Vault, WifiOff, X, Zap, ZoomIn, ZoomOut, LocateFixed } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import './styles.css';
import { services, concepts, phases, steps, workflows, scenarios, storageGuide, limitations } from './content.js';
import { createTimeline } from './simulation.js';
import { clampStep, evaluateSchedule, firstEligibleTimerTick, formatUtc } from './engine.js';
import { applyTheme, readThemePreference, resolveTheme, themeStorageKey } from './theme.js';

const iconMap = { monitor: Monitor, shield: Shield, server: Server, database: Database, inbox: Inbox, zap: Zap, clock: Clock, orbit: Orbit, store: Store, 'key-round': KeyRound, vault: Vault, activity: Activity, archive: Archive, 'calendar-clock': CalendarClock, 'check-circle-2': CheckCircle2, 'rotate-cw': RotateCcw, 'circle-alert': CircleAlert, 'file-warning': FileWarning, 'shield-alert': ShieldAlert, 'git-branch': GitBranch, 'wifi-off': WifiOff };
const stateKey = 'publish-workflow-explorer:v1';
const sampleSchedule = '2026-09-22T14:07:00Z';

function Icon({ name, size = 18, ...props }) {
    const Component = iconMap[name] ?? Network;
    return <Component size={size} strokeWidth={1.8} aria-hidden="true" {...props} />;
}

function readPreferences() {
    try {
        const parsed = JSON.parse(localStorage.getItem(stateKey) ?? '{}');
        return { mode: parsed.mode === 'scheduled' ? 'scheduled' : 'immediate', speed: [1, 1.5, 2].includes(parsed.speed) ? parsed.speed : 1 };
    } catch { return { mode: 'immediate', speed: 1 }; }
}

function useNarrow(query = '(max-width: 640px)') {
    const [narrow, setNarrow] = useState(() => matchMedia(query).matches);
    useEffect(() => {
        const media = matchMedia(query);
        const change = () => setNarrow(media.matches);
        media.addEventListener('change', change);
        return () => media.removeEventListener('change', change);
    }, [query]);
    return narrow;
}

function containTab(event, container) {
    if (event.key !== 'Tab') return;
    const focusable = [...container.querySelectorAll('button:not(:disabled), input, select, a[href], [tabindex="0"]')].filter(element => element.getClientRects().length);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}

function IconButton({ label, children, className = '', ...props }) {
    return <button type="button" className={`icon-button ${className}`} aria-label={label} title={label} {...props}>{children}</button>;
}

function Modal({ title, children, onClose, wide = false }) {
    const dialogRef = useRef(null);
    useEffect(() => {
        const dialog = dialogRef.current;
        const previous = document.activeElement;
        dialog.showModal();
        const cancel = event => { event.preventDefault(); onClose(); };
        dialog.addEventListener('cancel', cancel);
        return () => { dialog.removeEventListener('cancel', cancel); dialog.close(); previous?.focus?.(); };
    }, []);
    return <dialog ref={dialogRef} className={`modal ${wide ? 'modal-wide' : ''}`} onClick={event => { if (event.target === event.currentTarget) onClose(); }} aria-labelledby="dialog-title">
        <div className="modal-heading"><h2 id="dialog-title">{title}</h2><IconButton label="Close dialog" onClick={onClose}><X size={20} /></IconButton></div>
        <div className="modal-body">{children}</div>
    </dialog>;
}

function ServiceMark({ service, size = 18, className = '' }) {
    const item = services[service];
    return <span className={`service-mark ${className}`} style={{ '--service-color': item.color }}><Icon name={item.icon} size={size} /></span>;
}

function WorkflowNode({ data }) {
    const item = steps[data.stepId];
    return <div className={`workflow-node ${data.current ? 'is-current' : ''} ${data.done ? 'is-done' : ''} ${data.selected ? 'is-selected' : ''} ${data.tone === 'danger' ? 'is-danger' : ''} ${data.tone === 'warning' ? 'is-warning' : ''}`} data-step-id={data.stepId}>
        <Handle type="target" position={data.targetPosition} className="node-handle" />
        <div className="node-top"><ServiceMark service={item.service} size={17} /><span className="node-service">{services[item.service].short}</span><span className="node-index">{data.done && !data.current ? <Check size={14} /> : String(data.order).padStart(2, '0')}</span></div>
        <div className="node-title">{item.label}</div>
        <div className="node-bottom"><span>{data.phaseTitle}</span>{data.current && <span className="node-current"><i /> Current</span>}</div>
        <Handle type="source" position={data.sourcePosition} className="node-handle" />
    </div>;
}

const nodeTypes = { workflow: WorkflowNode };

function positionsFor(ids, narrow) {
    const columns = narrow ? 1 : 3;
    return Object.fromEntries(ids.map((id, index) => {
        const row = Math.floor(index / columns);
        const column = narrow ? 0 : row % 2 === 0 ? index % columns : columns - 1 - index % columns;
        return [id, { x: column * 267, y: row * 146 }];
    }));
}

function direction(from, to, target = false) {
    if (!from || !to) return target ? Position.Top : Position.Bottom;
    if (to.y > from.y) return target ? Position.Top : Position.Bottom;
    if (to.y < from.y) return target ? Position.Bottom : Position.Top;
    if (to.x > from.x) return target ? Position.Left : Position.Right;
    return target ? Position.Right : Position.Left;
}

function FlowDiagram({ timeline, cursor, selectedId, onSelect, playing, mode, scenario, expanded, setExpanded, theme }) {
    const narrow = useNarrow();
    const diagramRef = useRef(null);
    const [instance, setInstance] = useState(null);
    const ids = [...new Set(timeline.map(event => event.node))];
    const positions = positionsFor(ids, narrow);
    const completed = new Set(timeline.slice(0, cursor).map(event => event.node));
    const active = timeline[cursor];
    const dark = theme === 'dark';
    const nodes = ids.map((id, index) => {
        const item = steps[id];
        const sourcePosition = direction(positions[id], positions[ids[index + 1]]);
        const targetPosition = direction(positions[ids[index - 1]], positions[id], true);
        return { id, type: 'workflow', position: positions[id], sourcePosition, targetPosition, width: 236, height: 110, ariaLabel: `Step ${index + 1}: ${item.title}. ${services[item.service].name}`, data: { stepId: id, order: index + 1, targetPosition, sourcePosition, selected: id === selectedId, current: active.node === id, done: completed.has(id), tone: active.node === id ? active.tone : 'neutral', phaseTitle: phases.find(phase => phase.id === item.phase)?.title } };
    });
    const transitions = [];
    for (let index = 1; index < timeline.length; index++) {
        const source = timeline[index - 1].node;
        const target = timeline[index].node;
        if (source !== target && !transitions.some(edge => edge.source === source && edge.target === target)) transitions.push({ source, target, index });
    }
    const edges = transitions.map(edge => {
        const reached = edge.index <= cursor;
        const retryLoop = ids.indexOf(edge.target) <= ids.indexOf(edge.source);
        const color = retryLoop ? dark ? '#e1b968' : '#ab741e' : reached ? dark ? '#8db3ff' : '#285bca' : dark ? '#707780' : '#b8c0cf';
        return { id: `${edge.source}-${edge.target}`, source: edge.source, target: edge.target, type: retryLoop ? 'default' : 'smoothstep', animated: reached && playing && edge.target === active.node, label: retryLoop ? edge.target === 'timer' ? 'Next timer tick' : 'Retry accepted' : undefined, labelStyle: { fill: dark ? '#f2ce83' : '#825712', fontSize: 11, fontWeight: 600 }, labelBgStyle: { fill: dark ? '#3b3223' : '#fff6df' }, labelBgPadding: [7, 4], style: { stroke: color, strokeWidth: reached ? 2.1 : 1.6, strokeDasharray: retryLoop ? '5 4' : undefined }, markerEnd: { type: MarkerType.ArrowClosed, color, width: 17, height: 17 }, pathOptions: { borderRadius: 12, offset: 26 } };
    });

    function fit() {
        if (!instance) return;
        if (narrow && !expanded) instance.setCenter(118, Math.max(190, positions[active.node].y + 55), { zoom: 1, duration: 0 });
        else instance.fitView({ padding: 0.09, minZoom: 0.65, maxZoom: 1.05, duration: 200 });
    }
    useEffect(() => {
        if (!instance) return;
        let frame;
        const scheduleFit = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(fit);
        };
        const observer = new ResizeObserver(scheduleFit);
        observer.observe(diagramRef.current.querySelector('.flow-canvas'));
        scheduleFit();
        return () => { observer.disconnect(); cancelAnimationFrame(frame); };
    }, [instance, mode, scenario, narrow, expanded, narrow ? active.node : null]);
    useEffect(() => {
        if (!expanded) return;
        const previous = document.body.style.overflow;
        const previousFocus = document.activeElement;
        document.body.style.overflow = 'hidden';
        diagramRef.current.querySelector('[aria-label="Exit expanded diagram"]')?.focus();
        const close = event => { if (event.key === 'Escape') setExpanded(false); containTab(event, diagramRef.current); };
        document.addEventListener('keydown', close);
        return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', close); previousFocus?.focus?.(); };
    }, [expanded]);

    return <div ref={diagramRef} className={`diagram-tool ${expanded ? 'expanded' : ''}`} role={expanded ? 'dialog' : undefined} aria-modal={expanded || undefined} aria-label={expanded ? 'Expanded workflow diagram' : undefined}>
        <div className="diagram-heading"><div><Network size={16} /><span>Flow map</span><span className="map-count">{ids.length} stages</span></div><div className="diagram-actions">
            <IconButton label="Zoom out" onClick={() => instance?.zoomOut({ duration: 150 })}><ZoomOut size={17} /></IconButton>
            <IconButton label="Zoom in" onClick={() => instance?.zoomIn({ duration: 150 })}><ZoomIn size={17} /></IconButton>
            <IconButton label="Fit entire flow" onClick={() => instance?.fitView({ padding: 0.09, duration: 200 })}><LocateFixed size={17} /></IconButton>
            <IconButton label={expanded ? 'Exit expanded diagram' : 'Expand diagram'} onClick={() => setExpanded(!expanded)}>{expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</IconButton>
        </div></div>
        <div className="flow-canvas" data-testid="flow-canvas">
            <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} colorMode={theme} onInit={setInstance} onNodeClick={(_, node) => onSelect(node.id)} nodesDraggable={false} nodesConnectable={false} minZoom={0.25} maxZoom={2.4} panOnScroll={false} zoomOnScroll={false} zoomOnPinch fitView={false} selectionOnDrag={false} proOptions={{ hideAttribution: false }}>
                <Background color={dark ? '#46474d' : '#c8cbd3'} gap={22} size={1} />
            </ReactFlow>
        </div>
        <div className="diagram-legend"><span><i className="dot success" />Reached</span><span><i className="dot active" />Current</span><span><i className="dot pending" />Later in this scenario</span><span className="legend-example">Illustrative sequence</span></div>
    </div>;
}

function StepPanel({ selectedId, active, onService, onConcept, onSelect }) {
    const [tab, setTab] = useState('explain');
    const item = steps[selectedId] ?? steps[active.node];
    const isCurrent = item.id === active.node;
    return <aside className="step-panel" aria-label="Selected step explanation">
        <div className="step-heading"><ServiceMark service={item.service} size={23} /><div><span className="eyebrow">{services[item.service].name}</span><h2>{item.title}</h2></div></div>
        <p className="step-summary">{item.summary}</p>
        <div className="detail-tabs" role="tablist" aria-label="Step details">{[['explain', 'What happens'], ['data', 'Data'], ['failure', 'Failure']].map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{label}</button>)}</div>
        <div className="step-copy" role="tabpanel">
            {tab === 'explain' && <>{item.explanation.split('\n\n').map(paragraph => <p key={paragraph}>{paragraph}</p>)}<dl className="step-facts"><dt>What starts it</dt><dd>{item.input}</dd><dt>What it does</dt><dd>{item.work}</dd><dt>What comes next</dt><dd>{item.output}</dd></dl></>}
            {tab === 'data' && <><h3>Where the evidence goes</h3><p>{item.saved}</p><div className="plain-note"><Database size={18} /><p>Business records, detailed events, broker delivery counts, and diagnostic logs are different evidence.</p></div><h3>In this illustrated moment</h3><p>{isCurrent ? active.text : 'The data record below follows the current timeline position. Selecting a different diagram step does not invent a completed write.'}</p></>}
            {tab === 'failure' && <><div className="failure-label"><CircleAlert size={17} /> Failure and recovery</div><p>{item.failure}</p><div className="plain-note caution"><Info size={18} /><p>A retry can repeat one operation. It does not necessarily restart the whole publish or create a new business record.</p></div></>}
        </div>
        <div className="step-services"><h3>Services involved</h3><div>{item.services.map(service => <button type="button" key={service} onClick={() => onService(service)} className="service-link"><ServiceMark service={service} size={14} />{services[service].short}<ChevronRight size={13} /></button>)}</div></div>
        <div className="step-concepts"><h3>Concepts behind this step</h3>{item.concepts.map(term => <button type="button" key={term} onClick={() => onConcept(term)}><BookOpen size={13} />{term}</button>)}</div>
        {!isCurrent && <button className="text-action return-current" type="button" onClick={() => onSelect(active.node)}><LocateFixed size={15} />Return to current step</button>}
    </aside>;
}

function Ledger({ active, previous, expanded = false }) {
    const [openRecord, setOpenRecord] = useState('history');
    return <section className={`ledger-section ${expanded ? 'ledger-full' : ''}`} aria-label="Records at this point">
        <div className="section-heading"><div><span className="eyebrow">DATA AT THIS POINT</span><h2>What has actually been saved?</h2></div><span className="small-label">Step {active.title}</span></div>
        <div className="ledger-grid">{storageGuide.map(record => {
            const value = active.ledger[record.id];
            const changed = previous && JSON.stringify(value) !== JSON.stringify(previous[record.id]);
            const summary = Array.isArray(value) ? value.length ? value.at(-1) : 'No events recorded yet' : value;
            return <button type="button" className={`ledger-item ${changed ? 'record-changed' : ''} ${openRecord === record.id ? 'record-open' : ''}`} key={record.id} onClick={() => setOpenRecord(record.id)} aria-pressed={openRecord === record.id}>
                <div className="ledger-label"><ServiceMark service={record.service} size={16} /><span>{record.name}</span>{changed && <span className="updated-dot" title="Changed at this step" />}</div>
                <p>{summary}</p><span className="ledger-meta">{services[record.service].short}{Array.isArray(value) ? ` · ${value.length} recorded` : ''}<ChevronRight size={14} /></span>
            </button>;
        })}</div>
        {openRecord && <div className="record-detail"><div><h3>{storageGuide.find(record => record.id === openRecord).name}</h3><p>{storageGuide.find(record => record.id === openRecord).definition}</p><p className="record-limit">{storageGuide.find(record => record.id === openRecord).not}</p></div><div className="record-values">{Array.isArray(active.ledger[openRecord]) ? active.ledger[openRecord].length ? <ol>{active.ledger[openRecord].map((value, index) => <li key={`${value}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span>{value}</li>)}</ol> : <p className="muted">No events have been recorded here at this point.</p> : <p>{active.ledger[openRecord]}</p>}</div></div>}
    </section>;
}

function ServiceDetail({ id }) {
    const item = services[id];
    return <div className="service-detail"><div className="service-intro"><ServiceMark service={id} size={28} /><p>{item.definition}</p></div><h3>Why it is here</h3><p>{item.why}</p><h3>How it works in this flow</h3><p>{item.details}</p><h3>What it stores</h3><p>{item.stores}</p><h3>When it fails</h3><p>{item.failure}</p><div className="concept-callout"><BookOpen size={20} /><div><h3>System design connection</h3><p>{item.concept}</p></div></div></div>;
}

function ScheduleLab({ currentValue, onUse }) {
    const [requested, setRequested] = useState(currentValue.slice(0, 16));
    const [clock, setClock] = useState('2026-09-22T14:00');
    const [flags, setFlags] = useState({ processed: false, cancelled: false, publishingEnabled: true });
    let result;
    let tick;
    try { result = evaluateSchedule({ requestedAt: `${requested}:00Z`, now: `${clock}:00Z`, ...flags }); tick = firstEligibleTimerTick(`${requested}:00Z`); } catch { result = { eligible: false, reason: 'Enter a valid date and time.' }; }
    return <div className="schedule-lab"><p className="dialog-intro">The timer reads saved SQL schedules. The selected time controls eligibility, not the exact moment the restaurant applies the menu.</p>
        <div className="input-grid"><label>Requested time (UTC)<input type="datetime-local" value={requested} onChange={event => setRequested(event.target.value)} /></label><label>Time of the check (UTC)<input type="datetime-local" value={clock} onChange={event => setClock(event.target.value)} /></label></div>
        <fieldset className="schedule-flags"><legend>Stored schedule conditions</legend>{[['processed', 'Already marked processed'], ['cancelled', 'Schedule cancelled'], ['publishingEnabled', 'Restaurant publishing enabled']].map(([key, label]) => <label key={key}><input type="checkbox" checked={flags[key]} onChange={event => setFlags({ ...flags, [key]: event.target.checked })} />{label}</label>)}</fieldset>
        <div className={`eligibility ${result.eligible ? 'success' : 'warning'}`}><Icon name={result.eligible ? 'check-circle-2' : 'clock'} size={25} /><div><h3>{result.eligible ? 'Eligible on this check' : 'Not selected on this check'}</h3><p>{result.reason}</p></div></div>
        {tick && <dl className="lab-facts"><dt>First normal eligible timer tick</dt><dd>{formatUtc(tick)} · {tick.slice(0, 10)}</dd><dt>Selection window</dt><dd>Seven days late through one minute early</dd><dt>Clock schedule</dt><dd>Every quarter-hour, not a timer dedicated to each restaurant</dd></dl>}
        <button type="button" className="primary-button" disabled={!tick} onClick={() => onUse(`${requested}:00Z`)}><Check size={17} />Use this time in the journey</button>
    </div>;
}

function App() {
    const preferences = useRef(readPreferences()).current;
    const [themePreference, setThemePreference] = useState(readThemePreference);
    const systemDark = useNarrow('(prefers-color-scheme: dark)');
    const theme = resolveTheme(themePreference, systemDark);
    const mobileNavigation = useNarrow('(max-width: 820px)');
    const sidebarRef = useRef(null);
    const [mode, setMode] = useState(preferences.mode);
    const [view, setView] = useState('workflow');
    const [journeys, setJourneys] = useState({ immediate: { scenario: 'success', cursor: 0, selectedId: 'click', scheduledAt: sampleSchedule }, scheduled: { scenario: 'success', cursor: 0, selectedId: 'chooseTime', scheduledAt: sampleSchedule } });
    const [playing, setPlaying] = useState(false);
    const [speed, setSpeed] = useState(preferences.speed);
    const [diagramView, setDiagramView] = useState('map');
    const [expanded, setExpanded] = useState(false);
    const [drawer, setDrawer] = useState(false);
    const [modal, setModal] = useState(null);
    const [query, setQuery] = useState('');
    const [libraryQuery, setLibraryQuery] = useState('');
    const current = journeys[mode];
    const flow = workflows[mode];
    const timeline = createTimeline(mode, current.scenario, current.scheduledAt);
    const cursor = clampStep(current.cursor, timeline.length);
    const active = timeline[cursor];
    const selectedScenario = scenarios.find(item => item.id === current.scenario);
    const atEnd = cursor === timeline.length - 1;
    const progress = Math.round(((cursor + 1) / timeline.length) * 100);

    function updateJourney(change) { setJourneys(previous => ({ ...previous, [mode]: { ...previous[mode], ...change } })); }
    function goTo(index) { const next = clampStep(index, timeline.length); updateJourney({ cursor: next, selectedId: timeline[next].node }); }
    function selectStep(id) {
        const index = timeline.findIndex(event => event.node === id);
        setPlaying(false);
        if (index >= 0) goTo(index); else updateJourney({ selectedId: id });
    }
    function chooseMode(next) { setPlaying(false); setMode(next); setView('workflow'); setDrawer(false); setExpanded(false); }
    function chooseView(next) { setView(next); setPlaying(false); setDrawer(false); setLibraryQuery(''); }
    function chooseScenario(next) {
        const selectedId = workflows[mode].nodes[0];
        setPlaying(false);
        updateJourney({ scenario: next, cursor: 0, selectedId, ...(next === 'notDue' ? { scheduledAt: sampleSchedule } : {}) });
    }
    function playPause() { if (atEnd) goTo(0); setPlaying(previous => !previous); }
    function toggleTheme() {
        const next = theme === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        setThemePreference(next);
        try { localStorage.setItem(themeStorageKey, next); } catch {}
    }
    useEffect(() => { applyTheme(theme); }, [theme]);
    useEffect(() => {
        const syncTheme = event => {
            if (event.key === themeStorageKey || event.key === null) setThemePreference(readThemePreference());
        };
        window.addEventListener('storage', syncTheme);
        return () => window.removeEventListener('storage', syncTheme);
    }, []);
    useEffect(() => {
        try { localStorage.setItem(stateKey, JSON.stringify({ mode, speed })); } catch {}
    }, [mode, speed]);
    useEffect(() => {
        if (!playing) return;
        if (atEnd) { setPlaying(false); return; }
        const timer = setTimeout(() => goTo(cursor + 1), 4200 / speed);
        return () => clearTimeout(timer);
    }, [playing, cursor, speed, mode, current.scenario]);
    useEffect(() => {
        const onKey = event => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setModal({ type: 'search' }); setQuery(''); }
            if (event.key === 'Escape') { setDrawer(false); setExpanded(false); }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, []);
    useEffect(() => {
        if (!mobileNavigation) setDrawer(false);
    }, [mobileNavigation]);
    useEffect(() => {
        if (!drawer) return;
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        sidebarRef.current.querySelector('.mobile-close')?.focus();
        const trap = event => containTab(event, sidebarRef.current);
        document.addEventListener('keydown', trap);
        return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', trap); previousFocus?.focus?.(); };
    }, [drawer]);
    function showService(id) { setPlaying(false); setModal({ type: 'service', id }); }
    function showConcept(term) { setPlaying(false); setModal({ type: 'concept', term }); }

    const navItems = [['records', Layers, 'Data & status'], ['services', Network, 'Service library'], ['concepts', BookOpen, 'Concepts'], ['notes', ShieldAlert, 'Implementation notes']];
    const searchResults = query.trim() ? [
        ...Object.entries(services).filter(([, item]) => `${item.name} ${item.definition} ${item.details}`.toLowerCase().includes(query.toLowerCase())).map(([id, item]) => ({ title: item.name, text: item.definition, type: 'Service', action: () => setModal({ type: 'service', id }) })),
        ...concepts.filter(item => `${item.term} ${item.text} ${item.example}`.toLowerCase().includes(query.toLowerCase())).map(item => ({ title: item.term, text: item.text, type: 'Concept', action: () => setModal({ type: 'concept', term: item.term }) })),
        ...[...new Set(timeline.map(event => event.node))].filter(id => `${steps[id].title} ${steps[id].explanation} ${steps[id].failure}`.toLowerCase().includes(query.toLowerCase())).map(id => ({ title: steps[id].title, text: steps[id].summary, type: 'Workflow step', action: () => { selectStep(id); setView('workflow'); setModal(null); } }))
    ].slice(0, 18) : [];

    return <div className="app-shell">
        <a className="skip-link" href="#main-content">Skip to content</a>
        {drawer && <button type="button" className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setDrawer(false)} />}
        <aside ref={sidebarRef} className={`sidebar ${drawer ? 'drawer-open' : ''}`} aria-label="Main navigation" inert={mobileNavigation && !drawer ? true : undefined}>
            <div className="brand"><span className="brand-mark"><GitBranch size={23} strokeWidth={2} /></span><div><strong>Publish<span>Workflow</span></strong><small>MM2 · Architecture guide</small></div><IconButton label="Close navigation" className="mobile-close" onClick={() => setDrawer(false)}><X size={19} /></IconButton></div>
            <div className="nav-section-label">PUBLISH JOURNEYS</div>
            <nav className="journey-nav">{Object.values(workflows).map(item => <button type="button" key={item.id} className={mode === item.id && view === 'workflow' ? 'selected' : ''} onClick={() => chooseMode(item.id)} aria-current={mode === item.id && view === 'workflow' ? 'page' : undefined}><span className="nav-icon"><Icon name={item.icon} size={19} /></span><span><strong>{item.name}</strong><small>{item.id === 'immediate' ? 'Immediate publication' : 'Future publication'}</small></span><ChevronRight size={15} /></button>)}</nav>
            <div className="nav-section-label second-label">UNDERSTAND THE SYSTEM</div>
            <nav className="resource-nav">{navItems.map(([id, Component, title]) => <button type="button" key={id} className={view === id ? 'selected' : ''} onClick={() => chooseView(id)} aria-current={view === id ? 'page' : undefined}><Component size={18} strokeWidth={1.8} /><span>{title}</span>{id === 'notes' && <span className="nav-count">{limitations.length}</span>}</button>)}</nav>
            <div className="sidebar-bottom"><span className="offline-pill"><i />Offline illustration</span><p>Source-based MM2 behavior.<br />Not a live environment.</p><button type="button" onClick={() => setModal({ type: 'about' })}><Info size={15} />About this guide</button></div>
        </aside>
        <div className="main-shell" inert={drawer ? true : undefined}>
            <header className="topbar"><div><IconButton label="Open navigation" className="mobile-menu" onClick={() => setDrawer(true)}><Menu size={21} /></IconButton><span className="breadcrumb">Menu publishing</span><ChevronRight size={14} /><span className="breadcrumb-current">{view === 'workflow' ? flow.name : navItems.find(item => item[0] === view)?.[2]}</span></div><div><span className="source-date">Source trace · September 2026</span><IconButton label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggleTheme} className="theme-toggle">{theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}</IconButton><IconButton label="Search workflows and definitions" onClick={() => { setQuery(''); setModal({ type: 'search' }); }}><Search size={20} /></IconButton></div></header>
            <main id="main-content">
                {view === 'workflow' && <>
                    <section className="page-heading"><div><span className="eyebrow">{flow.eyebrow} <span className="heading-separator">/</span> MENU DELIVERY</span><h1>{flow.name}</h1><p>{flow.subtitle}</p></div><div className="heading-actions"><span className="scenario-badge"><i />Illustrative scenario</span>{mode === 'scheduled' && <button type="button" className="secondary-button" onClick={() => setModal({ type: 'schedule' })}><CalendarClock size={17} />{formatUtc(current.scheduledAt)}<ChevronDown size={14} /></button>}</div></section>
                    <div className="workflow-context"><Info size={16} /><span>{flow.key}</span></div>
                    <section className="scenario-toolbar" aria-label="Scenario and playback"><div className="scenario-picker"><label htmlFor="scenario">SCENARIO</label><div><Icon name={selectedScenario.icon} size={17} /><select id="scenario" value={current.scenario} onChange={event => chooseScenario(event.target.value)}>{scenarios.filter(item => item.both || mode === 'scheduled').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div></div><div className="playback"><IconButton label="Restart scenario" onClick={() => { setPlaying(false); goTo(0); }}><RotateCcw size={17} /></IconButton><IconButton label="Previous step" onClick={() => { setPlaying(false); goTo(cursor - 1); }} disabled={cursor === 0}><ArrowLeft size={18} /></IconButton><button type="button" className="play-button" onClick={playPause} aria-label={playing ? 'Pause journey' : atEnd ? 'Replay journey' : 'Play journey'}>{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}<span>{playing ? 'Pause' : atEnd ? 'Replay' : 'Play journey'}</span></button><IconButton label="Next step" onClick={() => { setPlaying(false); goTo(cursor + 1); }} disabled={atEnd}><ArrowRight size={18} /></IconButton><label className="speed-select"><span className="sr-only">Playback speed</span><select value={speed} onChange={event => setSpeed(Number(event.target.value))}><option value={1}>1x</option><option value={1.5}>1.5x</option><option value={2}>2x</option></select></label></div></section>
                    <div className="journey-progress"><div className="phase-strip">{phases.filter(phase => mode === 'scheduled' || phase.id !== 'wait').map(phase => { const isActive = steps[active.node].phase === phase.id; return <button type="button" key={phase.id} className={isActive ? 'active-phase' : ''} disabled={!timeline.some(event => steps[event.node].phase === phase.id)} onClick={() => { setPlaying(false); goTo(timeline.findIndex(event => steps[event.node].phase === phase.id)); }}><i />{phase.title}</button>; })}</div><div className="map-toggle" role="group" aria-label="Diagram display"><IconButton label="Flow diagram" className={diagramView === 'map' ? 'selected' : ''} aria-pressed={diagramView === 'map'} onClick={() => setDiagramView('map')}><Network size={17} /></IconButton><IconButton label="Step list" className={diagramView === 'list' ? 'selected' : ''} aria-pressed={diagramView === 'list'} onClick={() => setDiagramView('list')}><List size={18} /></IconButton></div></div>
                    <div className="workbench">
                        <div className="diagram-column">{diagramView === 'map' ? <FlowDiagram timeline={timeline} cursor={cursor} selectedId={current.selectedId} onSelect={selectStep} playing={playing} mode={mode} scenario={current.scenario} expanded={expanded} setExpanded={setExpanded} theme={theme} /> : <div className="step-list">{timeline.map((event, index) => <button type="button" key={event.id} className={index === cursor ? 'current' : ''} onClick={() => { setPlaying(false); goTo(index); }}><span className="list-number">{index < cursor ? <Check size={16} /> : String(index + 1).padStart(2, '0')}</span><ServiceMark service={steps[event.node].service} /><span><strong>{event.title}</strong><small>{services[steps[event.node].service].name}</small></span><ChevronRight size={16} /></button>)}</div>}
                            <div className={`event-strip ${active.tone}`} aria-live="polite"><span className="event-number">{String(cursor + 1).padStart(2, '0')}<small>/{String(timeline.length).padStart(2, '0')}</small></span><div><h3>{active.title}</h3><p>{active.text}</p>{active.clock && <span className="event-clock"><Clock size={13} />{active.clock}</span>}</div></div>
                            <label className="timeline-slider"><span className="sr-only">Journey progress</span><input type="range" min={0} max={timeline.length - 1} value={cursor} onChange={event => { setPlaying(false); goTo(Number(event.target.value)); }} style={{ '--progress': `${progress}%` }} /><span>{progress}%</span></label>
                            {atEnd && active.result && <div className={`outcome ${active.tone}`}><Icon name={active.tone === 'success' ? 'check-circle-2' : active.tone === 'danger' ? 'circle-alert' : 'clock'} size={23} /><div><h3>{active.result}</h3><p>{active.action}</p></div></div>}
                        </div>
                        <StepPanel selectedId={current.selectedId} active={active} onService={showService} onConcept={showConcept} onSelect={selectStep} />
                    </div>
                    <Ledger active={active} previous={timeline[cursor - 1]?.ledger} />
                </>}
                {view === 'records' && <><section className="page-heading"><div><span className="eyebrow">DATA OWNERSHIP</span><h1>One publish. Different records.</h1><p>A retry, a failure event, and a restaurant outcome are not the same thing.</p></div></section><Ledger active={active} previous={timeline[cursor - 1]?.ledger} expanded /><div className="reading-columns"><section><h2>Where retries and failures are saved</h2><p>Operation retries are technical attempts. Their available details belong in diagnostic logs. Service Bus keeps its own delivery counts and dead-letter state. A final business failure is recorded in Cosmos history when the failure-handling write succeeds. SQL holds the current summary and can be temporarily behind.</p><p>There is no universal “retry database.” The right place to look depends on which operation failed.</p></section><section><h2>What a successful earlier step does not prove</h2><dl className="step-facts"><dt>SQL request saved</dt><dd>The preparation message may still fail to send.</dd><dt>Cosmos package saved</dt><dd>A consumer may not have retrieved or staged it.</dd><dt>All required systems staged</dt><dd>The restaurant may not have applied it yet.</dd><dt>HTTP request accepted</dt><dd>The external action can still fail or report an offline store.</dd></dl></section></div></>}
                {view === 'services' && <><section className="page-heading"><div><span className="eyebrow">THE SUPPORTING SYSTEMS</span><h1>Each service has a job.</h1><p>What it does, why it is here, and what it does not prove.</p></div></section><label className="library-search"><Search size={19} /><input aria-label="Filter services" placeholder="Search services" value={libraryQuery} onChange={event => setLibraryQuery(event.target.value)} /></label><div className="service-grid">{Object.entries(services).filter(([, item]) => `${item.name} ${item.definition} ${item.group}`.toLowerCase().includes(libraryQuery.toLowerCase())).map(([id, item]) => <button type="button" className="service-card" key={id} onClick={() => showService(id)}><div><ServiceMark service={id} size={26} /><span className="category-label">{item.group}</span></div><h2>{item.name}</h2><p>{item.definition}</p><span className="text-action">Explore its role<ArrowRight size={16} /></span></button>)}</div>{!Object.values(services).some(item => `${item.name} ${item.definition} ${item.group}`.toLowerCase().includes(libraryQuery.toLowerCase())) && <div className="empty-state"><Search size={30} /><h2>No matching service</h2><button className="text-action" onClick={() => setLibraryQuery('')}>Clear search</button></div>}</>}
                {view === 'concepts' && <><section className="page-heading"><div><span className="eyebrow">PLAIN-ENGLISH DEFINITIONS</span><h1>The ideas behind the flow.</h1><p>System design concepts, connected to a real publishing step.</p></div></section><label className="library-search"><Search size={19} /><input aria-label="Filter concepts" placeholder="Search concepts" value={libraryQuery} onChange={event => setLibraryQuery(event.target.value)} /></label><div className="concept-list">{concepts.filter(item => `${item.term} ${item.text} ${item.example}`.toLowerCase().includes(libraryQuery.toLowerCase())).map((item, index) => <article key={item.term}><span className="concept-number">{String(index + 1).padStart(2, '0')}</span><div><h2>{item.term}</h2><p>{item.text}</p><div className="concept-example"><span>In this workflow</span><p>{item.example}</p></div></div></article>)}</div>{!concepts.some(item => `${item.term} ${item.text} ${item.example}`.toLowerCase().includes(libraryQuery.toLowerCase())) && <div className="empty-state"><Search size={30} /><h2>No matching definition</h2><button className="text-action" onClick={() => setLibraryQuery('')}>Clear search</button></div>}</>}
                {view === 'notes' && <><section className="page-heading"><div><span className="eyebrow">ACTUAL BEHAVIOR, NOT AN IDEALIZED DESIGN</span><h1>Important limits.</h1><p>Source-level observations. Compare the deployed version before diagnosing a live incident.</p></div></section><div className="notes-list">{limitations.map((item, index) => <article key={item.title}><span className="note-index">{String(index + 1).padStart(2, '0')}</span><div><h2>{item.title}</h2><p>{item.text}</p><button type="button" className="text-action" onClick={() => showService(item.service)}><Icon name={services[item.service].icon} size={15} />{services[item.service].name}<ChevronRight size={14} /></button></div></article>)}</div><div className="reading-columns"><section><h2>Recovery jobs do different work</h2><p>Reconciliation compares SQL summaries with Cosmos history. A separate recovery job can requeue a narrow set of stalled status messages. Apply Now checks revisit selected readiness work. Expiry can request eligible cancellation. Cleanup manages retained data.</p><p>None is a blanket promise to rebuild every failed publish automatically.</p></section><section><h2>Scope of these illustrations</h2><p>Emergency means MM2 immediate/manual publication. The separate HQ Auto-Publish service has additional workflows that are not established here. Which receiving systems participate, actual retry delivery limits, enabled timers, and network policies depend on deployment.</p><p>The illustrated statuses assume their writes succeed unless a scenario states otherwise. No simulation contacts a restaurant or cloud service.</p></section></div></>}
                <footer className="page-footer"><span>Publish Workflow <span className="footer-dot">·</span> MM2 learning guide</span><span>No live requests. No production data.</span></footer>
            </main>
        </div>
        {modal?.type === 'service' && <Modal title={services[modal.id].name} onClose={() => setModal(null)}><ServiceDetail id={modal.id} /></Modal>}
        {modal?.type === 'concept' && <Modal title={modal.term} onClose={() => setModal(null)}><div className="concept-modal"><BookOpen size={32} /><p>{concepts.find(item => item.term === modal.term)?.text ?? 'A concept used by the publishing workflow.'}</p><h3>In this workflow</h3><p>{concepts.find(item => item.term === modal.term)?.example}</p></div></Modal>}
        {modal?.type === 'schedule' && <Modal title="When will the timer select it?" onClose={() => setModal(null)}><ScheduleLab currentValue={current.scheduledAt} onUse={value => { updateJourney({ scheduledAt: value, scenario: current.scenario === 'notDue' ? 'success' : current.scenario, cursor: 0, selectedId: 'chooseTime' }); setPlaying(false); setModal(null); }} /></Modal>}
        {modal?.type === 'search' && <Modal title="Search the guide" onClose={() => setModal(null)} wide><label className="search-dialog-input"><Search size={20} /><input autoFocus aria-label="Search term" placeholder="Service, step, or system design concept" value={query} onChange={event => setQuery(event.target.value)} /></label><div className="search-results">{searchResults.map((item, index) => <button type="button" key={`${item.title}-${index}`} onClick={item.action}><span className="eyebrow">{item.type}</span><h3>{item.title}</h3><p>{item.text}</p><ChevronRight size={18} /></button>)}{query && !searchResults.length && <p className="empty-search">No matching topic.</p>}{!query && <div className="suggested-searches">{['Retry', 'Cosmos', 'JWT', 'Schedule', 'Staging'].map(term => <button type="button" key={term} onClick={() => setQuery(term)}><Search size={14} />{term}</button>)}</div>}</div></Modal>}
        {modal?.type === 'about' && <Modal title="About this guide" onClose={() => setModal(null)}><div className="about-copy"><span className="offline-pill"><i />Local, offline illustration</span><p>This guide explains immediate and scheduled menu publication from a September 2026 MM2 source trace. It uses plain-language descriptions instead of code or exact database names.</p><p>The scenarios are teaching examples, not recorded production incidents. External timing, delivery limits, enabled systems, and deployed policies must be checked in the relevant environment.</p><h3>No connection to live services</h3><p>All diagrams and scenario records run inside this page. There are no real API calls, cloud credentials, restaurant updates, or live discard operations. Only the selected workflow, playback speed, and theme preference are stored locally.</p><h3>How to interpret progress</h3><p>Each illustrated step shows which evidence could exist at that moment. A publish can have partial success across systems. The implementation notes preserve important cases where retry or recovery is not guaranteed.</p></div></Modal>}
    </div>;
}

createRoot(document.getElementById('root')).render(<App />);