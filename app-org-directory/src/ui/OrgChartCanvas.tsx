import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Background,
  Controls,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type ReactFlowInstance
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ChartData } from "../lib/chartTypes";
import { applyAutoLayout, clearManualLayout } from "../lib/chartLayout";
import { chartToFlow, type SeatNodeData } from "../lib/chartFlow";
import {
  connectManagerToReport,
  normalizeChartData,
  removeRelationshipById
} from "../lib/chartUtils";
import OrgChartSeatNode from "./OrgChartSeatNode";

const nodeTypes = { seat: OrgChartSeatNode };

type Props = {
  chartData: ChartData;
  canEdit: boolean;
  printMode?: boolean;
  selectedSeatId: string | null;
  onSelectSeat: (id: string | null) => void;
  onChartChange: (fn: (prev: ChartData) => ChartData) => void;
};

export default function OrgChartCanvas({
  chartData,
  canEdit,
  printMode,
  selectedSeatId,
  onSelectSeat,
  onChartChange
}: Props) {
  const flowRef = useRef<ReactFlowInstance<Node<SeatNodeData>, Edge> | null>(null);
  const chart = useMemo(() => normalizeChartData(chartData), [chartData]);

  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(
    () => chartToFlow(chart, selectedSeatId),
    [chart, selectedSeatId]
  );

  const onNodeDragStop = useCallback(
    (_evt: React.MouseEvent, node: Node<SeatNodeData>) => {
      if (!canEdit) return;
      onChartChange((prev) => {
        const n = normalizeChartData(prev);
        return {
          ...n,
          layout: {
            nodePositions: {
              ...n.layout!.nodePositions,
              [node.id]: { x: node.position.x, y: node.position.y }
            }
          }
        };
      });
    },
    [canEdit, onChartChange]
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
    if (printMode) {
      window.setTimeout(() => fitView(), 100);
    }
  }, [printMode, layoutNodes.length, fitView]);

  useEffect(() => {
    if (layoutNodes.length) {
      window.setTimeout(() => fitView(), 80);
    }
  }, [layoutNodes.length, fitView]);

  return (
    <div className={`od-flow-wrap${printMode ? " od-flow-wrap-print" : ""}`}>
      {!printMode && canEdit ? (
        <p className="od-canvas-hint od-no-print">
          Drag cards to reposition. Connect cards to update reporting lines. Save changes to keep the layout.
        </p>
      ) : null}
      {!printMode ? (
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
      ) : null}
      <ReactFlow
        nodes={layoutNodes}
        edges={layoutEdges}
        nodeTypes={nodeTypes}
        onInit={(inst) => {
          flowRef.current = inst;
        }}
        nodesDraggable={canEdit && !printMode}
        nodesConnectable={canEdit && !printMode}
        elementsSelectable={!printMode}
        edgesReconnectable={canEdit && !printMode}
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
        {!printMode ? <Controls showInteractive={canEdit} /> : null}
      </ReactFlow>
    </div>
  );
}
