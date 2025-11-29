/**
 * Visualization Tool for FluidTools
 * Generates charts using QuickChart API (free, no API key needed)
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Creates a visualization tool that can be used alongside Postman-generated tools
 * This tool allows the LLM to create charts from data
 */
export function createVisualizationTool() {
  return new DynamicStructuredTool({
    name: "create_chart_visualization",
    description: `Create a chart or graph to visualize data.

Use this tool when users ask to:
- "show as a graph"
- "visualize this"
- "plot a chart"
- "show trends"
- "display as bar chart/line chart/pie chart"

You should call this tool AFTER fetching data from other API tools.

Example workflow:
1. User asks: "Show my spending trends"
2. You call: get_transactions() to fetch data
3. You call: create_chart_visualization() with the data
4. User gets: A chart URL they can click

Supported chart types:
- line: For time series and trends
- bar: For comparisons between categories
- pie: For proportions and percentages`,

    schema: z.object({
      data: z.array(z.object({
        label: z.string().describe("X-axis label (e.g., 'January', 'Product A', '2024-01-01')"),
        value: z.number().describe("Y-axis value (e.g., 1200, 45, 99.9)")
      })).describe("Array of data points to visualize. Must have at least 1 data point."),

      chartType: z.enum(["line", "bar", "pie"]).describe("Type of chart: 'line' for trends/time series, 'bar' for comparisons, 'pie' for proportions"),

      title: z.string().optional().describe("Chart title (e.g., 'Monthly Sales', 'User Distribution')"),

      xLabel: z.string().optional().describe("Label for X-axis (e.g., 'Month', 'Category')"),

      yLabel: z.string().optional().describe("Label for Y-axis (e.g., 'Amount ($)', 'Count')")
    }),

    func: async ({ data, chartType, title, xLabel, yLabel }) => {
      try {
        // Validate data
        if (!data || data.length === 0) {
          return JSON.stringify({
            success: false,
            error: "No data provided for visualization",
            message: "Cannot create chart: no data points provided"
          });
        }

        // Build Chart.js configuration for QuickChart
        const chartConfig: any = {
          type: chartType,
          data: {
            labels: data.map(d => d.label),
            datasets: [{
              label: yLabel || "Value",
              data: data.map(d => d.value),
              fill: chartType === 'line' ? false : undefined,
              borderColor: chartType === 'line' ? 'rgb(75, 192, 192)' : undefined,
              backgroundColor: chartType === 'pie'
                ? generatePieColors(data.length)
                : chartType === 'bar'
                ? 'rgba(54, 162, 235, 0.8)'
                : undefined,
              tension: 0.1
            }]
          },
          options: {
            responsive: true,
            plugins: {
              title: {
                display: !!title,
                text: title || '',
                font: { size: 16 }
              },
              legend: {
                display: chartType === 'pie'
              }
            },
            scales: chartType !== 'pie' ? {
              y: {
                beginAtZero: true,
                title: {
                  display: !!yLabel,
                  text: yLabel || ''
                }
              },
              x: {
                title: {
                  display: !!xLabel,
                  text: xLabel || ''
                }
              }
            } : undefined
          }
        };

        // Generate QuickChart URL (free service, no API key)
        const encodedConfig = encodeURIComponent(JSON.stringify(chartConfig));
        const chartUrl = `https://quickchart.io/chart?width=600&height=400&c=${encodedConfig}`;

        // Also create a simple ASCII representation for text-based interfaces
        const asciiChart = generateASCIIChart(data, chartType);

        // Return structured response
        return JSON.stringify({
          success: true,
          chartUrl: chartUrl,
          chartType: chartType,
          dataPoints: data.length,
          title: title || 'Chart',
          asciiPreview: asciiChart,
          message: `✅ Chart created successfully!\n\n📊 View your ${chartType} chart here:\n${chartUrl}\n\nText preview:\n${asciiChart}\n\n💡 Click the link to see the full interactive chart.`
        });

      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
          message: `❌ Failed to create chart: ${error.message}`
        });
      }
    }
  });
}

/**
 * Generate colors for pie charts
 */
function generatePieColors(count: number): string[] {
  const baseColors = [
    'rgba(255, 99, 132, 0.8)',   // Red
    'rgba(54, 162, 235, 0.8)',   // Blue
    'rgba(255, 206, 86, 0.8)',   // Yellow
    'rgba(75, 192, 192, 0.8)',   // Green
    'rgba(153, 102, 255, 0.8)',  // Purple
    'rgba(255, 159, 64, 0.8)',   // Orange
    'rgba(201, 203, 207, 0.8)',  // Grey
    'rgba(255, 99, 255, 0.8)',   // Pink
  ];

  return Array.from({ length: count }, (_, i) => baseColors[i % baseColors.length]);
}

/**
 * Generate simple ASCII chart for text preview
 */
function generateASCIIChart(data: Array<{label: string, value: number}>, chartType: string): string {
  if (data.length === 0) return "No data to display";

  // Limit to first 10 items for readability
  const displayData = data.slice(0, 10);
  const hasMore = data.length > 10;

  const maxValue = Math.max(...displayData.map(d => d.value));
  const maxBarLength = 30; // characters
  const maxLabelLength = Math.max(...displayData.map(d => d.label.length), 10);

  let chart = "";

  if (chartType === 'bar' || chartType === 'line') {
    displayData.forEach(point => {
      const barLength = maxValue > 0 ? Math.round((point.value / maxValue) * maxBarLength) : 0;
      const bar = '█'.repeat(barLength);
      const label = point.label.padEnd(maxLabelLength);
      const valueStr = point.value.toLocaleString();
      chart += `${label} │ ${bar} ${valueStr}\n`;
    });

    if (hasMore) {
      chart += `... and ${data.length - 10} more data points\n`;
    }
  } else if (chartType === 'pie') {
    const total = displayData.reduce((sum, d) => sum + d.value, 0);
    displayData.forEach(point => {
      const percentage = total > 0 ? ((point.value / total) * 100).toFixed(1) : '0.0';
      const label = point.label.padEnd(maxLabelLength);
      chart += `${label} │ ${percentage}% (${point.value.toLocaleString()})\n`;
    });

    if (hasMore) {
      chart += `... and ${data.length - 10} more items\n`;
    }
  }

  return chart;
}
