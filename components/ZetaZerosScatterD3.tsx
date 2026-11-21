import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { RIEMANN_ZEROS } from '../lib/mathEngine';

interface ZetaZerosScatterD3Props {
  activeZeroCount: number;
}

export const ZetaZerosScatterD3: React.FC<ZetaZerosScatterD3Props> = ({ activeZeroCount }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const width = 560;
    const height = 280;
    const margin = { top: 30, right: 30, bottom: 40, left: 60 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleLinear()
      .domain([0, 1])
      .range([0, innerW]);

    const zerosToDisplay = RIEMANN_ZEROS.slice(0, Math.max(1, activeZeroCount));
    const maxGamma = d3.max(zerosToDisplay) ?? 80;
    const yScale = d3.scaleLinear()
      .domain([0, Math.max(90, maxGamma + 5)])
      .range([innerH, 0]);

    // Grid lines
    svg.append('g')
      .attr('transform', `translate(0, ${innerH})`)
      .call(d3.axisBottom(xScale).ticks(5).tickSize(-innerH).tickFormat(() => ''))
      .selectAll('line')
      .style('stroke', '#E2DDD2')
      .style('stroke-dasharray', '2,2');

    svg.append('g')
      .call(d3.axisLeft(yScale).ticks(6).tickSize(-innerW).tickFormat(() => ''))
      .selectAll('line')
      .style('stroke', '#E2DDD2')
      .style('stroke-dasharray', '2,2');

    // Axes
    svg.append('g')
      .attr('transform', `translate(0, ${innerH})`)
      .call(d3.axisBottom(xScale).ticks(5))
      .selectAll('text')
      .style('font-family', 'IBM Plex Mono')
      .style('font-size', '10px');

    svg.append('g')
      .call(d3.axisLeft(yScale).ticks(6))
      .selectAll('text')
      .style('font-family', 'IBM Plex Mono')
      .style('font-size', '10px');

    // Axis labels
    svg.append('text')
      .attr('x', innerW / 2)
      .attr('y', innerH + 34)
      .attr('text-anchor', 'middle')
      .style('font-family', 'IBM Plex Sans Arabic')
      .style('font-size', '11px')
      .style('fill', '#1C1917')
      .text('الجزء الحقيقي Re(s)');

    svg.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerH / 2)
      .attr('y', -42)
      .attr('text-anchor', 'middle')
      .style('font-family', 'IBM Plex Sans Arabic')
      .style('font-size', '11px')
      .style('fill', '#1C1917')
      .text('الجزء التخيلي γ_k (أصفار ريمان)');

    // Critical Line Re(s) = 0.5
    svg.append('line')
      .attr('x1', xScale(0.5))
      .attr('y1', 0)
      .attr('x2', xScale(0.5))
      .attr('y2', innerH)
      .style('stroke', '#9A3412')
      .style('stroke-width', '2px')
      .style('stroke-dasharray', '4,4');

    svg.append('text')
      .attr('x', xScale(0.5) + 6)
      .attr('y', 16)
      .style('font-family', 'IBM Plex Mono')
      .style('font-size', '10px')
      .style('fill', '#9A3412')
      .style('font-weight', 'bold')
      .text('الخط الحرج Re(s) = 0.5');

    // Tooltip
    const tooltip = d3.select('body').selectAll('.zeta-scatter-tooltip').data([0]).join('div')
      .attr('class', 'zeta-scatter-tooltip')
      .style('position', 'absolute')
      .style('visibility', 'hidden')
      .style('background', '#1C1917')
      .style('color', '#FBF9F5')
      .style('padding', '6px 10px')
      .style('border-radius', '6px')
      .style('font-family', 'IBM Plex Mono')
      .style('font-size', '11px')
      .style('z-index', '9999');

    // Scatter points for zeros on critical line
    zerosToDisplay.forEach((gamma, idx) => {
      svg.append('circle')
        .attr('cx', xScale(0.5))
        .attr('cy', yScale(gamma))
        .attr('r', 5.5)
        .style('fill', '#1E3A8A')
        .style('stroke', '#FFFFFF')
        .style('stroke-width', '1.5px')
        .style('cursor', 'pointer')
        .on('mouseover', (event) => {
          d3.select(event.currentTarget as any).attr('r', 8).style('fill', '#9A3412');
          tooltip.style('visibility', 'visible')
            .html(`الصفر غير التافه رقم #${idx + 1}<br/>s = 0.5 + i(${gamma.toFixed(4)})<br/>ρ = 1/2 + iγ<sub>${idx + 1}</sub>`);
        })
        .on('mousemove', (event) => {
          tooltip.style('top', `${event.pageY - 38}px`).style('left', `${event.pageX + 10}px`);
        })
        .on('mouseout', (event) => {
          d3.select(event.currentTarget as any).attr('r', 5.5).style('fill', '#1E3A8A');
          tooltip.style('visibility', 'hidden');
        });
    });

  }, [activeZeroCount]);

  return (
    <div className="bg-[#FBF9F5] border border-[#E2DDD2] rounded-xl p-5 flex flex-col items-center shadow-xs">
      <div className="w-full flex justify-between items-center mb-3">
        <h4 className="text-xs font-bold text-[#1E3A8A] font-mono">
          مخطط الانتشار لأصفار ريمان على الخط الحرج Re(s) = 0.5
        </h4>
        <span className="text-[11px] text-[#57534E] font-mono">{activeZeroCount} أصفار نشطة</span>
      </div>
      <svg ref={svgRef} className="overflow-visible" />
    </div>
  );
};
