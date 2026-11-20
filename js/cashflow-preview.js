/* Sankey Preview adapted for the MTPro dashboard and its monthly ledger. */
(() => {
'use strict';
const MT = window.MT = window.MT || {};
const palette = { income: '#22c55e', expense: '#fb7185', invested: '#0d9488',
  account: '#818cf8', cash_flow: '#6366f1', deficit: '#ef4444', surplus: '#10b981' };

function buildGraph(entries, mode) {
  const byWallet = mode === 'wallet';
  const nodes = [], links = [], indices = new Map(), edges = new Map();
  const balances = new Map(), transfers = new Map(), details = new Map();
  function node(kind, name) {
    const id = JSON.stringify([kind, name]);
    if (!indices.has(id)) {
      indices.set(id, nodes.length);
      nodes.push({ id, kind, name, color: palette[kind], incoming: 0, outgoing: 0 });
    }
    return indices.get(id);
  }
  function link(source, target, value) {
    const key = source + ':' + target;
    if (!edges.has(key)) {
      const edge = { source, target, value: 0 };
      edges.set(key, edge);
      links.push(edge);
    }
    edges.get(key).value += value;
    nodes[source].outgoing += value;
    nodes[target].incoming += value;
  }
  for (const [kind, wallet, category, sub, amount] of entries) {
    if (!(amount > 0)) continue;
    if (kind === 'transfer') {
      if (byWallet && wallet !== category) {
        const key = JSON.stringify([wallet, category]);
        transfers.set(key, (transfers.get(key) || 0) + amount);
      }
      continue;
    }
    const hub = node(byWallet ? 'account' : 'cash_flow', byWallet ? wallet : 'Arus Kas');
    const side = node(kind, category);
    const income = kind === 'income';
    link(income ? side : hub, income ? hub : side, amount);
    balances.set(hub, (balances.get(hub) || 0) + (income ? amount : -amount));
    if (kind === 'expense') {
      const id = nodes[side].id;
      if (!details.has(id)) details.set(id, new Map());
      const children = details.get(id);
      children.set(sub || 'Tanpa subkategori', (children.get(sub || 'Tanpa subkategori') || 0) + amount);
    }
  }
  // Only confirmed net transfers between a surplus and deficit wallet fund a flow.
  const funding = Array.from(transfers, ([key, value]) => {
    const [from, to] = JSON.parse(key);
    return [indices.get(JSON.stringify(['account', from])), indices.get(JSON.stringify(['account', to])),
      value - (transfers.get(JSON.stringify([to, from])) || 0)];
  }).sort((a, b) => b[2] - a[2]);
  for (const [from, to, net] of funding) {
    const moved = Math.min(net, balances.get(from) || 0, -(balances.get(to) || 0));
    if (moved > 0) {
      link(from, to, moved);
      balances.set(from, balances.get(from) - moved);
      balances.set(to, balances.get(to) + moved);
    }
  }
  for (const [hub, balance] of balances) {
    if (balance > 0) link(hub, node('surplus', 'Surplus'), balance);
    if (balance < 0) link(node('deficit', 'Defisit'), hub, -balance);
  }
  const capacity = nodes.reduce((sum, n) => sum + (n.incoming === 0 ? n.outgoing : 0), 0);
  const percent = value => String(Math.min(100, Math.round(value / capacity * 1000) / 10));
  const serialize = (item, value) => ({ ...item, value: String(value), percentage: percent(value) });
  const graph = cashFlowChartData({ currency: 'IDR', sankey: {
    basis: byWallet ? 'net_by_account' : 'net_by_category',
    nodes: nodes.map(n => serialize(n, Math.max(n.incoming, n.outgoing))),
    links: links.map(l => serialize(l, l.value))
  } });
  graph.details = details;
  return graph;
}

function sankeyNodeHasChildren(graph, id) {
  const children = graph.details?.get(id);
  return children && [...children.keys()].some(name => name !== 'Tanpa subkategori');
}
function zoomSankeyData(graph, id) {
  const root = graph.nodes.find(n => n.id === id);
  const nodes = [root], links = [];
  for (const [name, value] of graph.details.get(id)) {
    const percentage = Math.round(1000 * value / root.value) / 10;
    links.push({ source: 0, target: nodes.length, value, percentage });
    nodes.push({ id: JSON.stringify([id, name]), kind: 'expense', name, value, percentage, color: root.color });
  }
  return { nodes, links };
}
// Used when the server omits a node's colour. Invested keeps its own colour
// (IncomeStatement::Sankey::INVESTED_COLOR) rather than reading as income.
const FALLBACK_COLORS = {
  expense: "var(--color-destructive)",
  deficit: "var(--color-destructive)",
  invested: "#0d9488",
};

// Decimal strings remain authoritative on the wire. Conversion to Number is
// exclusively for D3 geometry and locale formatting, never financial totals.
function cashFlowChartData(body) {
  const graph = body.sankey;
  if (
    !/^[A-Z]{3,5}$/.test(body.currency) ||
    !["net_by_category", "net_by_account"].includes(graph?.basis) ||
    !Array.isArray(graph.nodes) ||
    !Array.isArray(graph.links)
  ) {
    throw new Error("Invalid cash flow graph");
  }
  const number = (value) => {
    if (
      typeof value !== "string" ||
      !/^\d+(\.\d+)?$/.test(value) ||
      !Number.isFinite(Number(value))
    ) {
      throw new Error("Invalid cash flow value");
    }
    return Number(value);
  };
  const ids = new Set();
  const nodes = graph.nodes.map((node) => {
    if (
      typeof node.id !== "string" ||
      ids.has(node.id) ||
      typeof node.name !== "string" ||
      ![
        "income",
        "expense",
        "cash_flow",
        "account",
        "surplus",
        "deficit",
        "invested",
      ].includes(node.kind)
    ) {
      throw new Error("Invalid cash flow node");
    }
    ids.add(node.id);
    const color = /^#[0-9a-f]{6}$/i.test(node.color)
      ? node.color
      : (FALLBACK_COLORS[node.kind] ?? "var(--color-success)");
    const value = number(node.value),
      percentage = number(node.percentage);
    if (value <= 0 || percentage > 100)
      throw new Error("Invalid cash flow node value");
    return { ...node, value, percentage, color };
  });
  const links = graph.links.map((link) => {
    if (
      ![link.source, link.target].every(
        (index) =>
          Number.isInteger(index) && index >= 0 && index < nodes.length,
      ) ||
      link.source === link.target
    ) {
      throw new Error("Invalid cash flow link");
    }
    const value = number(link.value),
      percentage = number(link.percentage);
    if (value <= 0 || percentage > 100)
      throw new Error("Invalid cash flow link value");
    return { ...link, value, percentage };
  });
  const indegree = nodes.map(() => 0);
  const outgoing = nodes.map(() => []);
  links.forEach(({ source, target }) => {
    indegree[target]++;
    outgoing[source].push(target);
  });
  const queue = indegree.flatMap((count, index) =>
    count === 0 ? [index] : [],
  );
  for (let i = 0; i < queue.length; i++) {
    outgoing[queue[i]].forEach((target) => {
      if (--indegree[target] === 0) queue.push(target);
    });
  }
  if (queue.length !== nodes.length) throw new Error("Cyclic cash flow graph");
  return { basis: graph.basis, nodes, links };
}

let nextChartId = 0;

// Preview-only renderer. Keep the legacy Sankey unchanged during comparison.
class PreviewChart {
  constructor(element) {
    this.element = element;
    this.gradientPrefix = 'cf-preview-' + ++nextChartId;
    this.nodeWidthValue = 15;
    this.nodePaddingValue = 20;
    this.labelsValue = {};
    this.zoomOutButtonTargets = [element.querySelector('[data-cf-back]')];
    this.zoomOutButtonTargets[0].addEventListener('click', () => this.zoomOut());
    this.sortControl = element.querySelector('[data-cf-sort]');
    this.sortControl.addEventListener('change', () => {
      sortOrder = this.sortControl.value;
      remember('sort', sortOrder);
      for (const instance of instances.values()) instance.applySort();
    });
  }

  // Visual constants
  static HOVER_OPACITY = 0.4;
  static HOVER_FILTER = "saturate(1.3) brightness(1.1)";
  static EXTENT_MARGIN = 16;
  static MIN_NODE_PADDING = 4;
  static MAX_PADDING_RATIO = 0.4;
  static CORNER_RADIUS = 8;
  static ZOOM_TRANSITION_MS = 220;
  static DEFAULT_COLOR = "var(--color-gray-400)";
  static CSS_VAR_MAP = {
    "var(--color-success)": "#10A861",
    "var(--color-destructive)": "#EC2222",
    "var(--color-gray-400)": "#9E9E9E",
    "var(--color-gray-500)": "#737373",
  };
  update(graph) {
    if (this.dataValue !== graph) this.zoomRootId = null;
    this.dataValue = graph;
    this.#syncZoomControls();
    this.applySort();
  }

  applySort() {
    this.sortOrder = sortOrder;
    this.sortControl.value = sortOrder;
    if (this.dataValue && this.element.offsetWidth) this.#draw();
  }

  clear() {
    clearTimeout(this.drawTimeout);
    this.tooltip?.remove();
    this.tooltip = null;
    this.#chartElement().replaceChildren();
    this.zoomRootId = null;
    this.dataValue = null;
    this.#syncZoomControls();
  }

  zoomOut() {
    if (!this.zoomRootId) return;

    this.focusAfterDraw = this.zoomRootId;
    this.zoomRootId = null;
    this.#syncZoomControls();
    this.#draw({ animate: true });
  }

  #draw({ animate = false } = {}) {
    const { nodes = [], links = [] } = this.#visibleData();

    // Hide tooltip and reset any hover states before redrawing
    this.#hideTooltip();

    const chartElement = this.#chartElement();
    const focusedNode = document.activeElement?.closest("[data-node-id]");
    if (focusedNode && chartElement.contains(focusedNode))
      this.focusAfterDraw ||= focusedNode.dataset.nodeId;
    const chart = d3.select(chartElement);

    clearTimeout(this.drawTimeout);
    chart.selectAll("svg").interrupt();

    if (!nodes.length || !links.length) {
      chart.selectAll("svg").remove();
      return;
    }

    if (animate) {
      chart
        .selectAll("svg")
        .transition()
        .duration(this.constructor.ZOOM_TRANSITION_MS / 2)
        .style("opacity", 0)
        .remove();

      this.drawTimeout = setTimeout(() => {
        this.#render(nodes, links, true);
      }, this.constructor.ZOOM_TRANSITION_MS / 2);
    } else {
      chart.selectAll("svg").remove();
      this.#render(nodes, links, false);
    }
  }

  #render(nodes, links, animate) {
    const chartElement = this.#chartElement();
    const chart = d3.select(chartElement);

    const width = Math.max(580, chartElement.clientWidth);
    const height = chartElement.clientHeight || 400;

    const svg = chart
      .append("svg")
      .attr("width", width)
      .attr("height", height)
      // Marks which order this drawing uses (a redraw fades the old one out).
      .attr("data-sort-order", this.sortOrder)
      .style("opacity", animate ? 0 : 1);

    const effectivePadding = this.#calculateNodePadding(nodes.length, height);
    const sankeyData = this.#generateSankeyData(
      nodes,
      links,
      width,
      height,
      effectivePadding,
    );

    this.#createGradients(svg, sankeyData.links);

    const linkPaths = this.#drawLinks(svg, sankeyData.links);
    const { nodeGroups, hiddenLabels } = this.#drawNodes(
      svg,
      sankeyData.nodes,
      width,
    );

    this.#attachHoverEvents(linkPaths, nodeGroups, sankeyData, hiddenLabels);

    if (animate) {
      svg
        .transition()
        .duration(this.constructor.ZOOM_TRANSITION_MS / 2)
        .style("opacity", 1);
    }
  }

  #chartElement() {
    return this.element.querySelector('.cf-preview-plot');
  }

  #visibleData() {
    if (!this.zoomRootId) return this.dataValue || {};

    return zoomSankeyData(this.dataValue, this.zoomRootId);
  }

  #syncZoomControls() {
    this.zoomOutButtonTargets.forEach((button) => {
      button.hidden = !this.zoomRootId;
    });
  }

  #zoomIn(node) {
    if (!node.id || !sankeyNodeHasChildren(this.#visibleData(), node.id))
      return;

    if (this.element.contains(document.activeElement))
      this.focusAfterDraw = node.id;
    this.zoomRootId = node.id;
    this.#syncZoomControls();
    this.#draw({ animate: true });
  }

  #nodeAction(node) {
    if (sankeyNodeHasChildren(this.#visibleData(), node.id)) return "button";
    return null;
  }

  #activateNode(node) {
    if (this.#nodeAction(node)) this.#zoomIn(node);
  }

  // Dynamic padding prevents padding from dominating when there are many nodes
  #calculateNodePadding(nodeCount, height) {
    const margin = this.constructor.EXTENT_MARGIN;
    const availableHeight = height - margin * 2;
    const maxPaddingTotal =
      availableHeight * this.constructor.MAX_PADDING_RATIO;
    const gaps = Math.max(nodeCount - 1, 1);
    const dynamicPadding = Math.min(
      this.nodePaddingValue,
      Math.floor(maxPaddingTotal / gaps),
    );
    return Math.max(this.constructor.MIN_NODE_PADDING, dynamicPadding);
  }

  #generateSankeyData(nodes, links, width, height, nodePadding) {
    const margin = this.constructor.EXTENT_MARGIN;
    const sankeyGenerator = d3.sankey()
      // Centre alignment: a sink sits at its depth, a source one column
      // before the nearest node it feeds. The default pushes every sink to
      // the last column, which is the subcategories' once a family has any.
      .nodeAlign(d3.sankeyCenter)
      .nodeWidth(this.nodeWidthValue)
      .nodePadding(nodePadding)
      .extent([
        [margin, margin],
        [width - margin, height - margin],
      ]);

    if (this.sortOrder === "ascending") {
      sankeyGenerator.nodeSort((a, b) => a.value - b.value);
    } else if (this.sortOrder === "descending") {
      sankeyGenerator.nodeSort((a, b) => b.value - a.value);
    }

    return sankeyGenerator({
      nodes: nodes.map((d) => ({
        ...d,
        // Structural labels belong to the UI locale, not the API fallback name.
        name: this.labelsValue[d.kind] || d.name,
      })),
      links: links.map((d) => ({ ...d })),
    });
  }

  #createGradients(svg, links) {
    const defs = svg.append("defs");

    links.forEach((link, i) => {
      const gradientId = this.#gradientId(link, i);
      const gradient = defs
        .append("linearGradient")
        .attr("id", gradientId)
        .attr("gradientUnits", "userSpaceOnUse")
        .attr("x1", link.source.x1)
        .attr("x2", link.target.x0);

      gradient
        .append("stop")
        .attr("offset", "0%")
        .attr("stop-color", this.#colorWithOpacity(link.source.color));

      gradient
        .append("stop")
        .attr("offset", "100%")
        .attr("stop-color", this.#colorWithOpacity(link.target.color));
    });
  }

  #gradientId(link, index) {
    return `${this.gradientPrefix}-link-gradient-${link.source.index}-${link.target.index}-${index}`;
  }

  #colorWithOpacity(nodeColor, opacity = 0.1) {
    const defaultColor = this.constructor.DEFAULT_COLOR;
    let colorStr = nodeColor || defaultColor;

    // Map CSS variables to hex values for d3 color manipulation
    colorStr = this.constructor.CSS_VAR_MAP[colorStr] || colorStr;

    // Unmapped CSS vars cannot be manipulated, return as-is
    if (colorStr.startsWith("var(--")) return colorStr;

    const d3Color = d3.color(colorStr);
    return d3Color ? d3Color.copy({ opacity }) : defaultColor;
  }

  #drawLinks(svg, links) {
    return svg
      .append("g")
      .attr("fill", "none")
      .selectAll("path")
      .data(links)
      .join("path")
      .attr("class", "sankey-link")
      .attr("d", (d) =>
        d3.linkHorizontal()({
          source: [d.source.x1, d.y0],
          target: [d.target.x0, d.y1],
        }),
      )
      .attr("stroke", (d, i) => `url(#${this.#gradientId(d, i)})`)
      .attr("stroke-width", (d) => Math.max(1, d.width))
      .style("transition", "opacity 0.3s ease");
  }

  #drawNodes(svg, nodes, width) {
    const nodeGroups = svg
      .append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .style("transition", "opacity 0.3s ease");

    nodeGroups
      .append("path")
      .attr("d", (d) => this.#nodePath(d))
      .attr("fill", (d) => d.color || this.constructor.DEFAULT_COLOR)
      .attr("stroke", (d) => (d.color ? "none" : "var(--color-gray-500)"));

    const hiddenLabels = this.#addNodeLabels(
      svg,
      nodeGroups,
      (node) => node.x1 < width / 2,
      nodes,
    );

    return { nodeGroups, hiddenLabels };
  }

  #nodePath(node) {
    const { x0, y0, x1, y1 } = node;
    const height = y1 - y0;
    const radius = Math.max(
      0,
      Math.min(this.constructor.CORNER_RADIUS, height / 2),
    );

    const isSourceNode =
      node.sourceLinks?.length > 0 && !node.targetLinks?.length;
    const isTargetNode =
      node.targetLinks?.length > 0 && !node.sourceLinks?.length;

    // Too small for rounded corners
    if (height < radius * 2) {
      return this.#rectPath(x0, y0, x1, y1);
    }

    if (isSourceNode) {
      return this.#roundedLeftPath(x0, y0, x1, y1, radius);
    }

    if (isTargetNode) {
      return this.#roundedRightPath(x0, y0, x1, y1, radius);
    }

    return this.#rectPath(x0, y0, x1, y1);
  }

  #rectPath(x0, y0, x1, y1) {
    return `M ${x0},${y0} L ${x1},${y0} L ${x1},${y1} L ${x0},${y1} Z`;
  }

  #roundedLeftPath(x0, y0, x1, y1, r) {
    return `M ${x0 + r},${y0}
            L ${x1},${y0}
            L ${x1},${y1}
            L ${x0 + r},${y1}
            Q ${x0},${y1} ${x0},${y1 - r}
            L ${x0},${y0 + r}
            Q ${x0},${y0} ${x0 + r},${y0} Z`;
  }

  #roundedRightPath(x0, y0, x1, y1, r) {
    return `M ${x0},${y0}
            L ${x1 - r},${y0}
            Q ${x1},${y0} ${x1},${y0 + r}
            L ${x1},${y1 - r}
            Q ${x1},${y1} ${x1 - r},${y1}
            L ${x0},${y1} Z`;
  }

  #addNodeLabels(svg, nodeGroups, labelOnRight, nodes) {
    const controller = this;
    const hiddenLabels = this.#calculateHiddenLabels(
      nodes,
      this.#measureLabels(svg, nodes, labelOnRight),
    );

    nodeGroups
      .append("text")
      .attr(
        "class",
        "text-xs font-medium text-primary fill-current select-none",
      )
      .style("cursor", "default")
      .style("opacity", (d) => (hiddenLabels.has(d.index) ? 0 : 1))
      // A hidden label can sit over another node's bar; it must not take
      // that bar's hovers and clicks, even while hover reveals it.
      .style("pointer-events", (d) =>
        hiddenLabels.has(d.index) ? "none" : null,
      )
      .style("transition", "opacity 0.2s ease")
      .each(function (d) {
        controller.#writeLabel(d3.select(this), d, labelOnRight);
      });

    return hiddenLabels;
  }

  // Name above amount, beside the bar on the side the label rule picks.
  #writeLabel(textEl, d, labelOnRight) {
    const right = labelOnRight(d);
    const x = right ? d.x1 + 6 : d.x0 - 6;

    textEl
      .attr("x", x)
      .attr("y", (d.y1 + d.y0) / 2)
      .attr("dy", "-0.2em")
      .attr("text-anchor", right ? "start" : "end");

    textEl.selectAll("tspan").remove();
    textEl.append("tspan").text(d.name);
    textEl
      .append("tspan")
      .attr("x", x)
      .attr("dy", "1.2em")
      .attr("class", "font-mono text-secondary")
      .style("font-size", "0.65rem")
      .text(this.#formatCurrency(d.value));
  }

  // Where each label lands at this width, measured with an invisible probe
  // before the real labels are drawn, so the overlap rule can see a label
  // that reaches into the next column.
  #measureLabels(svg, nodes, labelOnRight) {
    const probe = svg
      .append("text")
      .attr("class", "text-xs font-medium select-none")
      .style("visibility", "hidden");

    const boxes = new Map();
    nodes.forEach((d) => {
      this.#writeLabel(probe, d, labelOnRight);
      const { x, y, width: boxWidth, height } = probe.node().getBBox();
      boxes.set(d.index, { x, y, width: boxWidth, height });
    });

    probe.remove();
    return boxes;
  }

  // Calculate which labels should be hidden to prevent overlap
  #calculateHiddenLabels(nodes, labelBoxes) {
    const visible = [], hidden = new Set();
    for (const node of [...nodes].sort((a, b) => b.value - a.value)) {
      const box = labelBoxes.get(node.index);
      if (visible.some(v => box.x < v.x + v.width && v.x < box.x + box.width &&
        box.y < v.y + v.height + 3 && v.y < box.y + box.height + 3)) hidden.add(node.index);
      else visible.push(box);
    }
    return hidden;
  }

  #attachHoverEvents(linkPaths, nodeGroups, sankeyData, hiddenLabels) {
    const applyHover = (targetLinks) => {
      const targetSet = new Set(targetLinks);
      const connectedNodes = new Set(
        targetLinks.flatMap((l) => [l.source, l.target]),
      );

      linkPaths
        .style("opacity", (d) =>
          targetSet.has(d) ? 1 : this.constructor.HOVER_OPACITY,
        )
        .style("filter", (d) =>
          targetSet.has(d) ? this.constructor.HOVER_FILTER : "none",
        );

      nodeGroups.style("opacity", (d) =>
        connectedNodes.has(d) ? 1 : this.constructor.HOVER_OPACITY,
      );

      // Show labels for connected nodes (even if normally hidden)
      nodeGroups
        .selectAll("text")
        .style("opacity", (d) =>
          connectedNodes.has(d)
            ? 1
            : hiddenLabels.has(d.index)
              ? 0
              : this.constructor.HOVER_OPACITY,
        );
    };

    const resetHover = () => {
      linkPaths.style("opacity", 1).style("filter", "none");
      nodeGroups.style("opacity", 1);
      // Restore hidden labels to hidden state
      nodeGroups
        .selectAll("text")
        .style("opacity", (d) => (hiddenLabels.has(d.index) ? 0 : 1));
    };

    linkPaths
      .on("mouseenter", (event, d) => {
        applyHover([d]);
        // A link is a flow between two named nodes — without the names the
        // value floats context-free (the old tooltip showed only "$X (Y%)").
        this.#showTooltip(
          event,
          d.value,
          d.percentage,
          this.#tooltipContext(
            `${this.#esc(d.source.name)} → ${this.#esc(d.target.name)}`,
          ),
        );
      })
      .on("mousemove", (event) => this.#updateTooltipPosition(event))
      .on("mouseleave", () => {
        resetHover();
        this.#hideTooltip();
      });

    // One focus target per node; its bar and label share the same action.
    nodeGroups
      .attr("data-node-id", (d) => d.id)
      .attr("tabindex", (d) => (this.#nodeAction(d) ? 0 : null))
      .attr("role", (d) => this.#nodeAction(d))
      .attr("aria-label", (d) => `${d.name}, ${this.#formatCurrency(d.value)}`)
      .style("cursor", (d) => (this.#nodeAction(d) ? "pointer" : "default"))
      .on("click", (event, d) => {
        event.stopPropagation();
        this.#activateNode(d);
      })
      .on("keydown", (event, d) => {
        if (!["Enter", " "].includes(event.key) || !this.#nodeAction(d)) return;
        event.preventDefault();
        event.stopPropagation();
        this.#activateNode(d);
      })
      .on("focus", (event, d) => {
        applyHover(
          sankeyData.links.filter((l) => l.source === d || l.target === d),
        );
      })
      .on("blur", resetHover)
      .on("mouseenter", (event, d) => {
        applyHover(
          sankeyData.links.filter((l) => l.source === d || l.target === d),
        );
        this.#showTooltip(
          event,
          d.value,
          d.percentage,
          this.#tooltipContext(this.#esc(d.name)),
        );
      })
      .on("mousemove", (event) => this.#updateTooltipPosition(event))
      .on("mouseleave", () => {
        resetHover();
        this.#hideTooltip();
      });
    nodeGroups.selectAll("text").style("cursor", "inherit");

    if (this.focusAfterDraw) {
      nodeGroups
        .filter((d) => d.id === this.focusAfterDraw)
        .node()
        ?.focus();
      this.focusAfterDraw = null;
    }
  }

  // Tooltip methods

  #createTooltip() {
    const dialog = this.element.closest("dialog");
    this.tooltip = d3
      .select(dialog || document.body)
      .append("div")
      // Shared visual contract + this chart's positioning class; opacity is
      // toggled via inline style below.
      .attr("class", "cf-preview-tip")
      .style("opacity", 0)
      .style("pointer-events", "none");
  }

  // Node names are user-named categories; escape anything interpolated into
  // .html() (the previous code injected them raw).
  #esc(s) {
    return String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }

  // Context line shared by node and link tooltips: the (escaped) name(s) of
  // what's hovered. No color swatch — the hover highlight on the diagram
  // itself already says which ribbon the card belongs to.
  #tooltipContext(label) {
    // max-w-64 gives truncate a constraint to fire against — an absolute
    // tooltip otherwise grows to fit and never ellipsizes deep flows.
    return `<div class="max-w-64 text-xs text-secondary mb-1 truncate">${label}</div>`;
  }

  #showTooltip(event, value, percentage, contextHtml = null) {
    if (!this.tooltip) this.#createTooltip();

    const valueLine = `<span class="font-medium tabular-nums">${this.#formatCurrency(value)}</span> <span class="text-secondary">(${percentage || 0}%)</span>`;
    const content = contextHtml
      ? `${contextHtml}<div>${valueLine}</div>`
      : valueLine;

    const isInDialog = !!this.element.closest("dialog");
    const x = isInDialog ? event.clientX : event.pageX;
    const y = isInDialog ? event.clientY : event.pageY;

    this.tooltip
      .html(content)
      .style("position", isInDialog ? "fixed" : "absolute")
      .style("left", `${x + 10}px`)
      .style("top", `${y - 10}px`)
      .transition()
      .duration(100)
      .style("opacity", 1);
  }

  #updateTooltipPosition(event) {
    if (this.tooltip) {
      const isInDialog = !!this.element.closest("dialog");
      const x = isInDialog ? event.clientX : event.pageX;
      const y = isInDialog ? event.clientY : event.pageY;

      this.tooltip?.style("left", `${x + 10}px`).style("top", `${y - 10}px`);
    }
  }

  #hideTooltip() {
    if (this.tooltip) {
      this.tooltip
        ?.transition()
        .duration(100)
        .style("opacity", 0)
        .style("pointer-events", "none");
    }
  }

  #formatCurrency(value) {
    return MT.fmt.fmtRp(value);
  }
}

const instances = new Map();
const graphCache = new WeakMap();
function remember(key, value) {
  try { localStorage.setItem('mtpro_cf_preview_' + key, value); } catch {}
}
function read(key) {
  try { return localStorage.getItem('mtpro_cf_preview_' + key); } catch { return null; }
}
let enabled = read('enabled') === 'true';
let sortOrder = read('sort');
if (!['ascending', 'descending'].includes(sortOrder)) sortOrder = 'auto';

// Older dashboard responses already contain the complete category comparison.
function categoryEntries(dashboard) {
  const rows = [];
  const summary = dashboard.summary || {};
  const income = Object.entries(dashboard.incomeSources || {});
  if (!income.length) income.push(['Pemasukan', summary.totalInc]);
  income.forEach(([name, amount]) => rows.push(['income', '', name, '', amount]));
  let recorded = 0;
  for (const item of dashboard.catComp || []) {
    if (item.current > 0) {
      rows.push(['expense', '', item.category, '', item.current]);
      recorded += item.current;
    }
  }
  if (summary.totalExp > recorded) rows.push(['expense', '', 'Pengeluaran lain', '', summary.totalExp - recorded]);
  rows.push(['invested', '', 'Tabungan & Investasi', '', summary.totalSav]);
  return rows;
}

function draw(id, dashboard, mode) {
  const legacy = document.getElementById(id);
  const panel = legacy?.nextElementSibling;
  if (!panel?.classList.contains('cf-preview')) return false;
  legacy.hidden = enabled;
  panel.hidden = !enabled;
  const plot = panel.querySelector('.cf-preview-plot');
  if (!enabled) {
    instances.get(panel)?.clear();
    return false;
  }
  const entries = dashboard?.cashflowEntries || (dashboard && mode === 'category' ? categoryEntries(dashboard) : null);
  let message = '';
  if (!dashboard) message = 'Menunggu data arus kas…';
  else if (!Array.isArray(entries)) message = 'Rincian Preview belum tersedia. Muat ulang setelah Code.gs terbaru diterbitkan.';
  else if (!entries.some(e => e[0] !== 'transfer' && e[4] > 0)) message = 'Belum ada arus kas pada periode ini.';
  else if (!window.d3?.sankey) message = 'Pustaka grafik belum dimuat. Periksa koneksi lalu muat ulang.';
  if (message) {
    instances.get(panel)?.clear();
    plot.textContent = message;
    return true;
  }
  try {
    return renderPanel(panel, plot, dashboard, mode, entries);
  } catch (error) {
    console.error('Sankey Preview:', error);
    instances.get(panel)?.clear();
    plot.textContent = 'Diagram Preview gagal dimuat. Nonaktifkan Preview untuk melihat diagram standar.';
    return true;
  }
}

function renderPanel(panel, plot, dashboard, mode, entries) {
  if (!graphCache.has(dashboard)) graphCache.set(dashboard, new Map());
  const graphs = graphCache.get(dashboard);
  if (!graphs.has(mode)) graphs.set(mode, buildGraph(entries, mode));
  if (!instances.has(panel)) instances.set(panel, new PreviewChart(panel));
  if (plot.firstChild?.nodeType === 3) plot.replaceChildren();
  instances.get(panel).update(graphs.get(mode));
  return true;
}

function init(refresh) {
  const toggle = document.getElementById('cfPreviewEnabled');
  if (!toggle) return;
  toggle.checked = enabled;
  toggle.addEventListener('change', () => {
    enabled = toggle.checked;
    remember('enabled', String(enabled));
    refresh();
  });
  if (enabled) draw('cashflowSankeyWrap', null, 'category');
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.contentRect.width && enabled) instances.get(entry.target.parentElement)?.applySort();
      }
    });
    document.querySelectorAll('.cf-preview-plot').forEach(plot => observer.observe(plot));
  }
}
MT.cashflowPreview = { init, draw, buildGraph };
})();
