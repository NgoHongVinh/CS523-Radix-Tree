/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from "react";
import * as d3 from "d3";
import { motion } from "motion/react";

interface TrieNodeData {
  id: string;
  label: string;
  isWord: boolean;
  children: TrieNodeData[];
}

interface TrieVisualizerProps {
  data: TrieNodeData;
  activeNodeId?: string;
}

export const TrieVisualizer: React.FC<TrieVisualizerProps> = ({ data, activeNodeId }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !data) return;

    const width = 800;
    const height = 500;
    const margin = { top: 60, right: 60, bottom: 60, left: 60 };

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Add zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 3])
      .on("zoom", (event) => {
        zoomG.attr("transform", event.transform);
      });

    svg.call(zoom);

    const zoomG = svg.append("g");

    const g = zoomG.append("g");

    // Use nodeSize instead of size to prevent overlapping
    // [horizontal spacing, vertical spacing]
    const treeLayout = d3.tree<TrieNodeData>().nodeSize([120, 100]);
    const root = d3.hierarchy(data);
    treeLayout(root);

    // Center the tree initially or follow active node
    if (activeNodeId) {
      const activeNode = root.descendants().find(n => n.data.id === activeNodeId);
      if (activeNode) {
        const targetScale = 1.2;
        const transform = d3.zoomIdentity
          .translate(400 - activeNode.x * targetScale, 200 - activeNode.y * targetScale)
          .scale(targetScale);
        
        svg.transition()
          .duration(750)
          .ease(d3.easeCubicInOut)
          .call(zoom.transform, transform);
      }
    } else {
      const initialScale = 0.8;
      const initialTransform = d3.zoomIdentity
        .translate(400, 80)
        .scale(initialScale);
      svg.call(zoom.transform, initialTransform);
    }

    // Links
    const link = g.selectAll(".link-group")
      .data(root.links())
      .enter()
      .append("g")
      .attr("class", "link-group");

    link.append("path")
      .attr("class", "link")
      .attr("d", d3.linkVertical<any, any>()
        .x(d => d.x)
        .y(d => d.y)
      )
      .attr("fill", "none")
      .attr("stroke", d => {
        // Highlight path to active node
        if (activeNodeId) {
          const targetNode = root.descendants().find(n => n.data.id === activeNodeId);
          const path = targetNode ? targetNode.path(root) : [];
          if (path.includes(d.target)) return "#00f2ff";
        }
        return "#e8e4e1";
      })
      .attr("stroke-width", d => {
        const targetNode = root.descendants().find(n => n.data.id === activeNodeId);
        const path = targetNode ? targetNode.path(root) : [];
        return path.includes(d.target) ? 3 : 1.5;
      });

    // Link labels (Edge labels)
    link.append("text")
      .attr("dy", "0.35em")
      .attr("x", d => (d.source.x + d.target.x) / 2)
      .attr("y", d => (d.source.y + d.target.y) / 2)
      .attr("text-anchor", "middle")
      .attr("font-size", "11px")
      .attr("font-weight", "800")
      .attr("fill", d => {
        const targetNode = root.descendants().find(n => n.data.id === activeNodeId);
        const path = targetNode ? targetNode.path(root) : [];
        return path.includes(d.target) ? "#00f2ff" : "#2d2d2d";
      })
      .attr("stroke", "#fdfcfb")
      .attr("stroke-width", 4)
      .attr("paint-order", "stroke")
      .attr("font-family", "Inter, sans-serif")
      .attr("letter-spacing", "0.05em")
      .text(d => d.target.data.label.toUpperCase());

    // Nodes
    const node = g.selectAll(".node")
      .data(root.descendants())
      .enter()
      .append("g")
      .attr("class", d => `node ${d.data.isWord ? "is-word" : ""}`)
      .attr("transform", d => `translate(${d.x},${d.y})`);

    node.append("circle")
      .attr("r", d => d.data.id === activeNodeId ? 12 : 7)
      .attr("fill", d => {
        if (d.data.id === activeNodeId) return "#00f2ff";
        return d.data.isWord ? "#2d2d2d" : "#fff";
      })
      .attr("stroke", d => {
        if (d.data.id === activeNodeId) return "#2d2d2d";
        return d.data.isWord ? "#2d2d2d" : "#e8e4e1";
      })
      .attr("stroke-width", 2)
      .style("filter", d => d.data.id === activeNodeId ? "drop-shadow(0 0 12px rgba(0, 242, 255, 0.6))" : "none")
      .style("transition", "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)");

    // Root label
    node.filter(d => !d.parent)
      .append("text")
      .attr("dy", "-2em")
      .attr("text-anchor", "middle")
      .attr("font-size", "10px")
      .attr("font-weight", "900")
      .attr("fill", "#2d2d2d")
      .attr("letter-spacing", "0.2em")
      .text("ROOT");

  }, [data, activeNodeId]);

  return (
    <div className="w-full overflow-auto bg-[#fdfcfb] p-4">
      <svg
        ref={svgRef}
        width="100%"
        height="500"
        viewBox="0 0 800 500"
        preserveAspectRatio="xMidYMid meet"
        className="mx-auto"
      />
    </div>
  );
};
