import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  applyNodeChanges,
  Background,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type ReactFlowInstance
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ChartData } from "../lib/chartTypes";
import { applyAutoLayout, clearManualLayout } from "../lib/chartLayout";
import { chartToFlow, type SeatNodeData } from "../lib/chartFlow";
import {
  connectManagerToReport,
  ensureLayout,
  normalizeChartData,
  removeRelationshipById
} from "../lib/chartUtils";
import OrgChartSeatNode from "./OrgChartSeatNode";

const nodeTypes = { seat: OrgChartSeatNode };

type Props = {
  chartData: ChartData;
  canEdit: boolean;
  selectedSeatId: string | null;
  onSelectSeat: (id: string | null) => void;
  onChartChange: (fn: (prev: ChartData) => ChartData) => void;
};

function chartSyncKey(chart: ChartData, selectedSeatId: string | null): string {
  const layout = ensureLayout(chart).nodePositions;
  return JSON.stringify({
    seats: chart.seats,
    departments: chart.departments,
    relationships: chart.relationships,
    layout,
    selectedSeatId
  });
}

export default function OrgChartCanvas({
  chartData,
  canEdit,
  selectedSeatId,
  onSelectSeat,
  onChartChange
}: Props) {
  const flowRef = useRef<ReactFlowInstance<Node<SeatNodeData>, Edge> | null>(null);
  const isDraggingRef = useRef(false);
  const chart = useMemo(() => normalizeChartData(chartData), [chartData]);
  const syncKey = useMemo(() => chartSyncKey(chart, selectedSeatId), [chart, selectedSeatId]);

  const flowFromChart = useMemo(() => chartToFlow(chart, selectedSeatId), [chart, selectedSeatId]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<SeatNodeData>>(flowFromChart.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(flowFromChart.edges);

  /** Re-sync from chart_data when structure/layout changes — not while user is dragging. */
  useEffect(() => {
    if (isDraggingRef.current) return;
    const next = chartToFlow(chart, selectedSeatId);
    setNodes(next.nodes);
    setEdges(next.edges);
  }, [syncKey, chart, selectedSeatId, setNodes, setEdges]);

  const persistNodePosition = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      onChartChange((prev) => {
        const n = normalizeChartData(prev);
        return {
          ...n,
          layout: {
            nodePositions: {
              ...ensureLayout(n).nodePositions,
              [nodeId]: { x: position.x, y: position.y }
            }
          }
        };
      });
    },
    [onChartChange]
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange<Node<SeatNodeData>>[]) => {
      setNodes((current) => applyNodeChanges(changes, current));

      if (!canEdit) return;

      for (const change of changes) {
        if (change.type === "position") {
          if (change.dragging === true) {
            isDraggingRef.current = true;
          }
          if (change.dragging === false && change.position) {
            isDraggingRef.current = false;
            persistNodePosition(change.id, change.position);
          }
        }
      }
    },
    [canEdit, persistNodePosition, setNodes]
  );

  const onNodeDragStart = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const onNodeDragStop = useCallback(
    (_evt: React.MouseEvent, node: Node<SeatNodeData>) => {
      isDraggingRef.current = false;
      if (!canEdit) return;
      persistNodePosition(node.id, node.position);
    },
    [canEdit, persistNodePosition]
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!canEdit || !conn.source || !conn.target || conn.source === conn.target) return;
      onChartChange((prev) => ({
        ...normalizeChartData(prev),
        relationships: connectManagerToReport(conn.source, conn.target, prev.relationships, "direct")
      }));
    },
    [canEdit, onChartChange]
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      if (!canEdit || !deleted.length) return;
      onChartChange((prev) => {
        let rels = prev.relationships;
        for (const e of deleted) rels = removeRelationshipById(String(e.id), rels);
        return { ...prev, relationships: rels };
      });
    },
    [canEdit, onChartChange]
  );

  const onNodeClick = useCallback(
    (_evt: React.MouseEvent, node: Node<SeatNodeData>) => {
      onSelectSeat(node.id);
    },
    [onSelectSeat]
  );

  const onPaneClick = useCallback(() => {
    onSelectSeat(null);
  }, [onSelectSeat]);

  const fitView = useCallback(() => {
    flowRef.current?.fitView({ padding: 0.2, duration: 200 });
  }, []);

  const autoArrange = useCallback(() => {
    if (!canEdit) return;
    if (!window.confirm("Auto-arrange will reposition all cards. Saved manual positions will be replaced. Continue?")) {
      return;
    }
    onChartChange((prev) => applyAutoLayout(normalizeChartData(prev)));
    window.setTimeout(() => fitView(), 50);
  }, [canEdit, onChartChange, fitView]);

  const resetLayout = useCallback(() => {
    if (!canEdit) return;
    if (
      !window.confirm(
        "Reset layout clears saved card positions. The chart will use auto-layout until you drag cards again. Continue?"
      )
    ) {
      return;
    }
    onChartChange((prev) => clearManualLayout(normalizeChartData(prev)));
    window.setTimeout(() => fitView(), 50);
  }, [canEdit, onChartChange, fitView]);

  useEffect(() => {
    if (nodes.length) {
      window.setTimeout(() => fitView(), 80);
    }
  }, [nodes.length, fitView]);

  return (
    <div className="od-flow-wrap">
      {canEdit ? (
        <p className="od-canvas-hint od-no-print">
          Drag cards to reposition. Connect cards to update reporting lines. Save changes to keep the layout.
        </p>
      ) : null}
      <div className="od-flow-toolbar od-no-print">
        <button type="button" className="od-btn" onClick={fitView}>
          Fit to view
        </button>
        {canEdit ? (
          <>
            <button type="button" className="od-btn" onClick={autoArrange}>
              Auto-arrange
            </button>
            <button type="button" className="od-btn" onClick={resetLayout}>
              Reset layout
            </button>
          </>
        ) : null}
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={(inst) => {
          flowRef.current = inst;
        }}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        nodesDraggable={canEdit}
        nodesConnectable={canEdit}
        elementsSelectable
        edgesReconnectable={canEdit}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
        minZoom={0.2}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} color="#e2e8f0" />
        <Controls showInteractive={canEdit} />
      </ReactFlow>
    </div>
  );
}
