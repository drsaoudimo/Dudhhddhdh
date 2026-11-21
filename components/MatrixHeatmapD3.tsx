import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface MatrixHeatmapD3Props {
  matrix: number[][];
  title: string;
}

export const MatrixHeatmapD3: React.FC<MatrixHeatmapD3Props> = ({ matrix, title }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current || !matrix || matrix.length === 0) return;

    const rows = matrix.length;
    const cols = matrix[0].length;

    const margin = { top: 30, right: 30, bottom: 40, left: 50 };
    const width = 520 - margin.left - margin.right;
    const height = Math.max(220, rows * 26) - margin.top - margin.bottom;

    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const flatValues = matrix.flat();
    const minVal = Math.min(...flatValues);
    const maxVal = Math.max(...flatValues);

    const x = d3.scaleBand<string>()
      .range([0, width])
      .domain(d3.range(cols).map(String))
      .padding(0.06);

    const y = d3.scaleBand<string>()
      .range([0, height])
      .domain(d3.range(rows).map(String))
      .padding(0.06);

    const colorScale = d3.scaleSequential()
      .interpolator(d3.interpolateBlues)
      .domain([minVal, maxVal === minVal ? maxVal + 1 : maxVal]);

    // X Axis
    svg.append('g')
      .attr('transform', `translate(0, ${height})`)
      .call(d3.axisBottom(x).tickFormat(d => `c${Number(d) + 1}`))
      .selectAll('text')
      .style('font-family', 'IBM Plex Mono')
      .style('font-size', '10px')
      .style('fill', '#57534E');

    // Y Axis
    svg.append('g')
      .call(d3.axisLeft(y).tickFormat(d => `r${Number(d) + 1}`))
      .selectAll('text')
      .style('font-family', 'IBM Plex Mono')
      .style('font-size', '10px')
      .style('fill', '#57534E');

    // Tooltip div
    const tooltip = d3.select('body').selectAll('.matrix-d3-tooltip').data([0]).join('div')
      .attr('class', 'matrix-d3-tooltip')
      .style('position', 'absolute')
      .style('visibility', 'hidden')
      .style('background', '#1C1917')
      .style('color', '#FBF9F5')
      .style('padding', '6px 10px')
      .style('border-radius', '6px')
      .style('font-family', 'IBM Plex Mono')
      .style('font-size', '11px')
      .style('box-shadow', '0 4px 12px rgba(0,0,0,0.15)')
      .style('z-index', '9999');

    // Heatmap cells
    matrix.forEach((row, i) => {
      row.forEach((val, j) => {
        const xPos = x(String(j)) ?? 0;
        const yPos = y(String(i)) ?? 0;
        const bw = x.bandwidth();
        const bh = y.bandwidth();
        const numVal = Number(val);
        const numMax = Number(maxVal);

        svg.append('rect')
          .attr('x', xPos)
          .attr('y', yPos)
          .attr('width', bw)
          .attr('height', bh)
          .attr('rx', 3)
          .style('fill', colorScale(numVal))
          .style('stroke', '#E2DDD2')
          .style('stroke-width', '1px')
          .style('cursor', 'pointer')
          .on('mouseover', (event) => {
            d3.select(event.currentTarget as any).style('stroke', '#1E3A8A').style('stroke-width', '2px');
            tooltip.style('visibility', 'visible')
              .html(`الإحداثي المصفوفي: [الصف ${i + 1}, العمود ${j + 1}]<br/>القيمة الفورية: <strong>${numVal}</strong>`);
          })
          .on('mousemove', (event) => {
            tooltip.style('top', `${event.pageY - 38}px`).style('left', `${event.pageX + 10}px`);
          })
          .on('mouseout', (event) => {
            d3.select(event.currentTarget as any).style('stroke', '#E2DDD2').style('stroke-width', '1px');
            tooltip.style('visibility', 'hidden');
          });

        if (cols * rows <= 120 && bw > 22 && bh > 16) {
          svg.append('text')
            .attr('x', xPos + bw / 2)
            .attr('y', yPos + bh / 2 + 3)
            .attr('text-anchor', 'middle')
            .style('font-family', 'IBM Plex Mono')
            .style('font-size', '10px')
            .style('fill', numVal > (numMax * 0.6) ? '#FFFFFF' : '#1C1917')
            .style('pointer-events', 'none')
            .text(numVal);
        }
      });
    });

  }, [matrix]);

  return (
    <div className="bg-[#FBF9F5] border border-[#E2DDD2] rounded-xl p-4 flex flex-col items-center overflow-x-auto shadow-xs">
      <div className="w-full flex justify-between items-center mb-3 px-2">
        <span className="text-xs font-bold text-[#1E3A8A] font-mono">
          خريطة حرارية D3.js تفاعلية · {title}
        </span>
        <span className="text-[11px] text-[#57534E] font-mono">
          الأبعاد: {matrix.length} × {matrix[0]?.length || 0}
        </span>
      </div>
      <svg ref={svgRef} className="overflow-visible" />
    </div>
  );
};
