// shared-long-format.js — plain JS, no JSX
// Requires React, shared.js (sec, inp, lbl, roleColors, isNumericValue, PALETTE),
// and shared-color-input.js (ColorInput) to be loaded globally before this script.

// ── Long-format Pipeline Components ─────────────────────────────────────────

// Column role assignment editor (used in group plot long format)
function ColumnRoleEditor(props) {
  const headers = props.headers,
    rows = props.rows,
    colRoles = props.colRoles,
    colNames = props.colNames,
    onRoleChange = props.onRoleChange,
    onNameChange = props.onNameChange;
  return React.createElement(
    "div",
    { style: sec },
    React.createElement(
      "p",
      { style: { margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#555" } },
      "Column roles"
    ),
    React.createElement(
      "div",
      { style: { display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" } },
      Object.entries(roleColors).map(function (entry) {
        const r = entry[0],
          c = entry[1];
        return React.createElement(
          "span",
          {
            key: r,
            style: {
              fontSize: 10,
              padding: "2px 8px",
              borderRadius: 4,
              background: c,
              color: r === "ignore" ? "#666" : "#fff",
              fontWeight: 600,
            },
          },
          r
        );
      })
    ),
    React.createElement(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: 8 } },
      headers.map(function (h, i) {
        const u = [];
        const seen = {};
        rows.forEach(function (r) {
          const v = r[i];
          if (!seen[v]) {
            seen[v] = true;
            u.push(v);
          }
        });
        const pv = u.slice(0, 5).join(", ") + (u.length > 5 ? " \u2026 (" + u.length + ")" : "");
        return React.createElement(
          "div",
          {
            key: "col-" + i,
            style: {
              display: "flex",
              gap: 10,
              alignItems: "center",
              padding: "8px 12px",
              background: "#fff",
              borderRadius: 6,
              border: "2px solid " + (roleColors[colRoles[i]] || "#ccc"),
            },
          },
          React.createElement(
            "span",
            { style: { fontWeight: 700, color: "#333", minWidth: 20, fontSize: 12 } },
            "#" + (i + 1)
          ),
          React.createElement("input", {
            value: colNames[i],
            onChange: function (e) {
              onNameChange(i, e.target.value);
            },
            style: Object.assign({}, inp, { width: 120, fontWeight: 600 }),
          }),
          React.createElement(
            "select",
            {
              value: colRoles[i],
              onChange: function (e) {
                onRoleChange(i, e.target.value);
              },
              style: Object.assign({}, inp, {
                cursor: "pointer",
                fontWeight: 600,
                color: roleColors[colRoles[i]],
              }),
            },
            React.createElement("option", { value: "group" }, "group"),
            React.createElement("option", { value: "value" }, "value"),
            React.createElement("option", { value: "filter" }, "filter"),
            React.createElement("option", { value: "text" }, "text"),
            React.createElement("option", { value: "ignore" }, "ignore")
          ),
          React.createElement(
            "span",
            {
              style: {
                fontSize: 10,
                color: "#999",
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              },
            },
            pv
          )
        );
      })
    )
  );
}

// Filter panel with checkboxes for each column
function FilterCheckboxPanel(props) {
  const headers = props.headers,
    colNames = props.colNames,
    colRoles = props.colRoles,
    filters = props.filters,
    filteredCount = props.filteredCount,
    totalCount = props.totalCount,
    onToggle = props.onToggle,
    onToggleAll = props.onToggleAll;
  return React.createElement(
    "div",
    {
      style: {
        flex: 1,
        borderRadius: 10,
        padding: 16,
        border: "1px solid #bfdbfe",
        background: "#eff6ff",
        display: "flex",
        flexDirection: "column",
      },
    },
    React.createElement(
      "p",
      { style: { margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#1d4ed8" } },
      "Filter rows (" + filteredCount + "/" + totalCount + ")"
    ),
    React.createElement(
      "div",
      { style: { display: "flex", gap: 16, flexWrap: "wrap", alignItems: "stretch", flex: 1 } },
      headers.map(function (h, i) {
        if (colRoles[i] === "ignore") return null;
        const u = filters[i] ? filters[i].unique : [];
        const isNumCol =
          u.length > 0 &&
          u.filter(function (v) {
            return isNumericValue(v);
          }).length /
            u.length >
            0.5;
        if (isNumCol && colRoles[i] !== "filter" && colRoles[i] !== "text") {
          return React.createElement(
            "div",
            {
              key: "col-" + i,
              style: {
                minWidth: 140,
                flex: 1,
                background: "#fff",
                borderRadius: 6,
                border: "1px solid #ddd",
                padding: 10,
              },
            },
            React.createElement(
              "div",
              { style: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" } },
              React.createElement(
                "p",
                { style: { fontSize: 11, fontWeight: 600, color: "#333", margin: 0 } },
                colNames[i]
              ),
              React.createElement(
                "button",
                {
                  onClick: function () {
                    onToggleAll(i, true);
                  },
                  style: {
                    fontSize: 9,
                    padding: "2px 6px",
                    background: "#eee",
                    border: "1px solid #ccc",
                    borderRadius: 3,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  },
                },
                "All"
              )
            ),
            React.createElement(
              "p",
              { style: { fontSize: 10, color: "#999", margin: "4px 0 0", fontStyle: "italic" } },
              "numeric \u2014 use axis range in plot"
            )
          );
        }
        return React.createElement(
          "div",
          {
            key: "col-" + i,
            style: {
              minWidth: 140,
              flex: 1,
              background: "#fff",
              borderRadius: 6,
              border: "1px solid #ddd",
              padding: 10,
            },
          },
          React.createElement(
            "p",
            { style: { fontSize: 11, fontWeight: 600, color: "#333", marginBottom: 4 } },
            colNames[i]
          ),
          React.createElement(
            "div",
            { style: { display: "flex", gap: 6, marginBottom: 4 } },
            React.createElement(
              "button",
              {
                onClick: function () {
                  onToggleAll(i, true);
                },
                style: {
                  fontSize: 9,
                  padding: "2px 6px",
                  background: "#eee",
                  border: "1px solid #ccc",
                  borderRadius: 3,
                  cursor: "pointer",
                  fontFamily: "inherit",
                },
              },
              "All"
            ),
            React.createElement(
              "button",
              {
                onClick: function () {
                  onToggleAll(i, false);
                },
                style: {
                  fontSize: 9,
                  padding: "2px 6px",
                  background: "#eee",
                  border: "1px solid #ccc",
                  borderRadius: 3,
                  cursor: "pointer",
                  fontFamily: "inherit",
                },
              },
              "None"
            )
          ),
          u.map(function (v) {
            const checked = filters[i] && filters[i].included ? filters[i].included.has(v) : false;
            return React.createElement(
              "label",
              {
                key: v,
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  color: "#444",
                  cursor: "pointer",
                  marginBottom: 2,
                },
              },
              React.createElement("input", {
                type: "checkbox",
                checked: checked,
                onChange: function () {
                  onToggle(i, v);
                },
                style: { accentColor: "#648FFF" },
              }),
              v || React.createElement("em", { style: { color: "#bbb" } }, "(empty)")
            );
          })
        );
      })
    )
  );
}

// Rename values & reorder groups panel
function RenameReorderPanel(props) {
  const headers = props.headers,
    colNames = props.colNames,
    colRoles = props.colRoles,
    filters = props.filters,
    valueRenames = props.valueRenames,
    groupColIdx = props.groupColIdx,
    effectiveOrder = props.effectiveOrder,
    applyRename = props.applyRename,
    onRenameVal = props.onRenameVal,
    onReorder = props.onReorder,
    dragIdx = props.dragIdx,
    onDragStart = props.onDragStart,
    onDragEnd = props.onDragEnd;
  return React.createElement(
    "div",
    {
      style: {
        flex: 1,
        borderRadius: 10,
        padding: 16,
        border: "1px solid #ddd6fe",
        background: "#f5f3ff",
      },
    },
    React.createElement(
      "p",
      { style: { margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#6d28d9" } },
      "Rename values & reorder groups ",
      React.createElement(
        "span",
        { style: { fontSize: 10, color: "#a78bfa", fontWeight: 400 } },
        "(drag \u2630 to reorder groups on plot)"
      )
    ),
    React.createElement(
      "div",
      { style: { display: "flex", gap: 16, flexWrap: "wrap" } },
      headers.map(function (h, i) {
        if (colRoles[i] !== "group" && colRoles[i] !== "filter") return null;
        const u = (filters[i] ? filters[i].unique : []).filter(function (v) {
          return filters[i] && filters[i].included && filters[i].included.has(v);
        });
        const isGrp = i === groupColIdx;
        const renamedU = u.map(function (v) {
          return { orig: v, renamed: applyRename(i, v) };
        });
        const orderedU =
          isGrp && effectiveOrder
            ? effectiveOrder
                .map(function (g) {
                  return renamedU.find(function (x) {
                    return x.renamed === g;
                  });
                })
                .filter(Boolean)
            : renamedU;
        const displayList = orderedU.length > 0 ? orderedU : renamedU;
        return React.createElement(
          "div",
          {
            key: "col-" + i,
            style: {
              minWidth: 200,
              background: "#fff",
              borderRadius: 6,
              border: "1px solid #ddd",
              padding: 10,
            },
          },
          React.createElement(
            "p",
            { style: { fontSize: 11, fontWeight: 600, color: "#333", marginBottom: 6 } },
            colNames[i]
          ),
          displayList.map(function (item, vi) {
            const v = item.orig;
            return React.createElement(
              "div",
              {
                key: v,
                draggable: isGrp,
                onDragStart: function () {
                  onDragStart(vi);
                },
                onDragOver: function (e) {
                  e.preventDefault();
                },
                onDrop: function () {
                  if (!isGrp || dragIdx === null || dragIdx === vi) {
                    onDragEnd();
                    return;
                  }
                  const cur = displayList.map(function (x) {
                    return x.renamed;
                  });
                  const moved = cur[dragIdx];
                  cur.splice(dragIdx, 1);
                  cur.splice(vi, 0, moved);
                  onReorder(cur);
                  onDragEnd();
                },
                onDragEnd: function () {
                  onDragEnd();
                },
                style: {
                  display: "flex",
                  gap: 4,
                  alignItems: "center",
                  marginBottom: 3,
                  padding: "3px 4px",
                  borderRadius: 4,
                  background: isGrp && dragIdx === vi ? "#e0eaff" : "transparent",
                  cursor: isGrp ? "grab" : "default",
                  borderLeft: isGrp ? "3px solid #648FFF" : "3px solid transparent",
                },
              },
              isGrp
                ? React.createElement(
                    "span",
                    { style: { fontSize: 11, color: "#bbb", cursor: "grab" } },
                    "\u2630"
                  )
                : null,
              React.createElement(
                "span",
                {
                  style: {
                    fontSize: 10,
                    color: "#888",
                    minWidth: 55,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  },
                },
                v || "(empty)"
              ),
              React.createElement("span", { style: { fontSize: 10, color: "#bbb" } }, "\u2192"),
              React.createElement("input", {
                value: valueRenames[i] && valueRenames[i][v] != null ? valueRenames[i][v] : v,
                onChange: function (e) {
                  onRenameVal(i, v, e.target.value);
                },
                style: Object.assign({}, inp, { width: 100, fontSize: 11 }),
              })
            );
          })
        );
      })
    )
  );
}

// Summary stats table (used in group plot output step)
function StatsTable(props) {
  const stats = props.stats,
    groupLabel = props.groupLabel;
  if (!stats || stats.length === 0) return null;
  const headers = ["Group", "n", "Mean", "Median", "SD", "SEM", "Min", "Max"];
  return React.createElement(
    "div",
    { style: sec },
    React.createElement(
      "p",
      { style: { margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#555" } },
      'Summary \u2014 grouped by "' + groupLabel + '"'
    ),
    React.createElement(
      "div",
      { style: { overflowX: "auto" } },
      React.createElement(
        "table",
        { style: { borderCollapse: "collapse", fontSize: 12, width: "100%" } },
        React.createElement(
          "thead",
          null,
          React.createElement(
            "tr",
            { style: { borderBottom: "2px solid #ccc" } },
            headers.map(function (h) {
              return React.createElement(
                "th",
                {
                  key: h,
                  style: { padding: "4px 10px", textAlign: "left", color: "#666", fontWeight: 600 },
                },
                h
              );
            })
          )
        ),
        React.createElement(
          "tbody",
          null,
          stats.map(function (s, i) {
            return React.createElement(
              "tr",
              { key: s.name, style: { borderBottom: "1px solid #eee" } },
              React.createElement(
                "td",
                {
                  style: {
                    padding: "4px 10px",
                    fontWeight: 600,
                    color: PALETTE[i % PALETTE.length],
                  },
                },
                s.name
              ),
              React.createElement("td", { style: { padding: "4px 10px" } }, s.n),
              React.createElement(
                "td",
                { style: { padding: "4px 10px" } },
                s.mean != null ? s.mean.toFixed(4) : "\u2014"
              ),
              React.createElement(
                "td",
                { style: { padding: "4px 10px" } },
                s.median != null ? s.median.toFixed(4) : "\u2014"
              ),
              React.createElement(
                "td",
                { style: { padding: "4px 10px" } },
                s.sd != null ? s.sd.toFixed(4) : "\u2014"
              ),
              React.createElement(
                "td",
                { style: { padding: "4px 10px" } },
                s.sem != null ? s.sem.toFixed(4) : "\u2014"
              ),
              React.createElement(
                "td",
                { style: { padding: "4px 10px" } },
                s.min != null ? s.min.toFixed(4) : "\u2014"
              ),
              React.createElement(
                "td",
                { style: { padding: "4px 10px" } },
                s.max != null ? s.max.toFixed(4) : "\u2014"
              )
            );
          })
        )
      )
    )
  );
}

// Condition/group color editor with ColorInput per group
function GroupColorEditor(props) {
  const groups = props.groups,
    onColorChange = props.onColorChange,
    onNameChange = props.onNameChange;
  const onToggle = props.onToggle;
  return React.createElement(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: 4 } },
    groups.map(function (g, i) {
      const enabled = g.enabled !== false;
      const children = [];
      if (onToggle) {
        children.push(
          React.createElement("input", {
            key: "cb",
            type: "checkbox",
            checked: enabled,
            onChange: function () {
              onToggle(i);
            },
            style: { accentColor: g.color, flexShrink: 0, cursor: "pointer" },
          })
        );
      }
      children.push(
        React.createElement(ColorInput, {
          key: "clr",
          value: g.color,
          onChange: function (c) {
            onColorChange(i, c);
          },
          size: 18,
        })
      );
      children.push(
        React.createElement("input", {
          key: "nm",
          value: g.displayName || g.name,
          onChange: function (e) {
            if (onNameChange) onNameChange(i, e.target.value);
          },
          style: {
            flex: 1,
            minWidth: 0,
            background: "#fff",
            border: "1px solid #ccc",
            borderRadius: 4,
            color: "#333",
            padding: "2px 4px",
            fontSize: 11,
            fontFamily: "inherit",
          },
        })
      );
      children.push(
        React.createElement(
          "span",
          { key: "n", style: { color: "#999", fontSize: 10, flexShrink: 0 } },
          "n=" + (g.stats ? g.stats.n : 0)
        )
      );
      return React.createElement(
        "div",
        {
          key: g.name,
          style: {
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 8px",
            borderRadius: 6,
            fontSize: 12,
            background: enabled ? "#f0f0f5" : "#fafafa",
            opacity: enabled ? 1 : 0.4,
            border: "1px solid #ccc",
          },
        },
        children
      );
    })
  );
}

// Style controls section (background, grid, grid color)
function BaseStyleControls(props) {
  const plotBg = props.plotBg,
    onPlotBgChange = props.onPlotBgChange,
    showGrid = props.showGrid,
    onShowGridChange = props.onShowGridChange,
    gridColor = props.gridColor,
    onGridColorChange = props.onGridColorChange;
  const children = [
    React.createElement(
      "div",
      {
        key: "bg",
        style: { display: "flex", alignItems: "center", justifyContent: "space-between" },
      },
      React.createElement("span", { style: lbl }, "Background"),
      React.createElement(ColorInput, { value: plotBg, onChange: onPlotBgChange, size: 24 })
    ),
    React.createElement(
      "div",
      {
        key: "grid",
        style: { display: "flex", alignItems: "center", justifyContent: "space-between" },
      },
      React.createElement("span", { style: lbl }, "Grid"),
      React.createElement("input", {
        type: "checkbox",
        checked: showGrid,
        onChange: function (e) {
          onShowGridChange(e.target.checked);
        },
        style: { accentColor: "#648FFF" },
      })
    ),
  ];
  if (showGrid) {
    children.push(
      React.createElement(
        "div",
        {
          key: "gc",
          style: { display: "flex", alignItems: "center", justifyContent: "space-between" },
        },
        React.createElement("span", { style: lbl }, "Grid color"),
        React.createElement(ColorInput, { value: gridColor, onChange: onGridColorChange, size: 24 })
      )
    );
  }
  return children;
}
