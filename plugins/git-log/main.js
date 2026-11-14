import { createIcon } from './icons.js';

(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = {
    commits: [], graph: [], cursor: null, selected: null, ref: '', tip: '',
    refs: {}, generation: 0, detailGeneration: 0, loading: false,
    dim: true, caseSensitive: false, regex: false, sort: 'desc', checks: {}, checkGeneration: 0,
    collapsed: false,
  };
  const pending = new Map();
  let sequence = 0;
  const colors = ['#78b7f3', '#d8a16c', '#a4c97a', '#c59ddc', '#75c9be', '#e48d98'];
  const rowHeight = 24;
  const splitterState = { left: 220, right: 300, details: 280 };

  function call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = 'git-log-' + ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('Request timed out: ' + method)); }, 15000);
      pending.set(id, { resolve, reject, timer });
      window.parent.postMessage({ jsonrpc: '2.0', id, method, params }, '*');
    });
  }

  window.addEventListener('message', event => {
    if (event.source !== window.parent || !event.data || event.data.jsonrpc !== '2.0') return;
    const message = event.data;
    const request = pending.get(message.id);
    if (request) {
      clearTimeout(request.timer); pending.delete(message.id);
      if (message.error) {
        const error = new Error(message.error.message || 'Request failed');
        // The host reports the JSON-RPC numeric code and puts the specific
        // reason (GIT_WORKSPACE_DENIED, GIT_STALE_CURSOR, ...) in data.code.
        error.code = message.error.data?.code || message.error.code;
        request.reject(error);
      }
      else request.resolve(message.result);
    } else if (message.method === 'theme:variables') {
      Object.entries(message.params?.variables || {}).forEach(([key, value]) => {
        if (key.startsWith('--')) document.documentElement.style.setProperty(key, String(value));
      });
    }
  });

  const text = value => value == null ? '' : String(value);

  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = text(value);
    return node;
  }

  function showStatus(message, error = false) {
    $('status').textContent = message;
    $('status').classList.toggle('error', error);
  }

  function iconButton(id, iconName, label) {
    const button = $(id);
    if (!button) return null;
    button.replaceChildren(createIcon(iconName, 14));
    if (!button.getAttribute('aria-label')) button.setAttribute('aria-label', label);
    return button;
  }

  /**
   * Short, sortable timestamp for the date column. The full ISO stamp stays in
   * the tooltip so nothing is lost.
   */
  function formatDate(value) {
    const raw = text(value);
    if (!raw) return '';
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (!match) return raw;
    return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}`;
  }

  function normalizeCommit(commit) {
    const author = commit.author && typeof commit.author === 'object' ? commit.author.name : commit.author;
    return {
      ...commit,
      hash: text(commit.hash || commit.id),
      subject: text(commit.subject),
      author: text(author || commit.authorName),
      date: text(commit.date || commit.authorDate),
      parents: Array.isArray(commit.parents) ? commit.parents : [],
      refs: Array.isArray(commit.refs) ? commit.refs : [],
      onHead: commit.onHead !== false,
    };
  }

  /**
   * Lays out the lane graph.
   *
   * A lane keeps a stable index so a branch never changes colour halfway down
   * the history: the colour is chosen when the lane opens (a tip, or the second
   * parent of a merge) and is kept for the whole lane. Parents that are not
   * loaded yet keep their lane open, so an edge continues across the page
   * boundary instead of disappearing.
   */
  function layoutGraph(commits) {
    const ids = new Set(commits.map(commit => commit.hash));
    const lanes = [];
    let colorIndex = 0;
    const free = () => { let index = lanes.indexOf(null); if (index < 0) { index = lanes.length; lanes.push(null); } return index; };

    return commits.map(commit => {
      const incoming = [];
      lanes.forEach((lane, index) => { if (lane && lane.id === commit.hash) incoming.push(index); });

      const mine = incoming.length ? incoming[0] : free();
      let color;
      if (incoming.length) {
        color = lanes[mine].color;
      } else {
        color = colors[colorIndex % colors.length];
        colorIndex += 1;
      }

      const row = { mine, color, pass: [], incoming: [], outgoing: [], unresolved: [] };
      lanes.forEach((lane, index) => {
        if (lane && !incoming.includes(index)) row.pass.push({ index, color: lane.color });
      });
      incoming.forEach(index => {
        row.incoming.push({ index, color: lanes[index].color });
        lanes[index] = null;
      });

      commit.parents.forEach((parent, index) => {
        let lane = lanes.find(entry => entry && entry.id === parent);
        if (!lane) {
          const isFirstParent = index === 0;
          lane = { id: parent, color: isFirstParent ? color : colors[colorIndex % colors.length] };
          if (!isFirstParent) colorIndex += 1;
          const target = isFirstParent && !lanes[mine] ? mine : free();
          lanes[target] = lane;
        }
        row.outgoing.push({ index: lanes.indexOf(lane), color: lane.color });
        if (!ids.has(parent)) row.unresolved.push(parent);
      });

      return row;
    });
  }

  function graphNode(graph, flipped) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    const laneIndices = [graph.mine, ...graph.pass.map(edge => edge.index), ...graph.incoming.map(edge => edge.index), ...graph.outgoing.map(edge => edge.index)];
    const width = Math.max(24, (Math.max(...laneIndices) + 1) * 13 + 8);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(rowHeight));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    if (flipped) svg.setAttribute('transform', `translate(0 ${rowHeight}) scale(1 -1)`);
    const x = index => 10 + index * 13;

    const path = (d, color, widthValue) => {
      const node = document.createElementNS(ns, 'path');
      node.setAttribute('d', d);
      node.setAttribute('fill', 'none');
      node.setAttribute('stroke', color);
      node.setAttribute('stroke-width', widthValue || '1.5');
      svg.appendChild(node);
    };

    graph.pass.forEach(pass => path(`M${x(pass.index)} 0V${rowHeight}`, pass.color));
    graph.incoming.forEach(edge => path(`M${x(edge.index)} 0C${x(edge.index)} 6 ${x(graph.mine)} 6 ${x(graph.mine)} 12`, edge.color));
    graph.outgoing.forEach(edge => path(`M${x(graph.mine)} 12C${x(graph.mine)} 18 ${x(edge.index)} 18 ${x(edge.index)} ${rowHeight}`, edge.color));

    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', String(x(graph.mine)));
    dot.setAttribute('cy', '12');
    dot.setAttribute('r', '4');
    dot.setAttribute('fill', graph.color);
    svg.appendChild(dot);
    return svg;
  }

  /**
   * The commits in display order.
   *
   * Git always hands out newest first, and the lane graph is only correct on
   * that order, because a commit's parents follow it. The ascending view
   * therefore reverses the loaded window and flips every row's graph, exactly
   * like the reference layout does.
   */
  function viewCommits() {
    return state.sort === 'asc' ? state.commits.slice().reverse() : state.commits;
  }

  function renderRows() {
    const list = $('list');
    const spacer = $('spacer');
    spacer.replaceChildren();
    const view = viewCommits();
    spacer.style.height = view.length * rowHeight + 'px';

    const start = Math.max(0, Math.floor(list.scrollTop / rowHeight) - 8);
    const end = Math.min(view.length, Math.ceil((list.scrollTop + list.clientHeight) / rowHeight) + 8);
    const flipped = state.sort === 'asc';

    for (let index = start; index < end; index += 1) {
      const commit = view[index];
      // The graph row always belongs to the descending layout.
      const graphIndex = flipped ? state.commits.length - 1 - index : index;
      const row = element('div', 'row');
      row.id = 'commit-' + commit.hash;
      row.dataset.hash = commit.hash;
      row.style.top = index * rowHeight + 'px';
      row.setAttribute('role', 'row');
      row.setAttribute('aria-rowindex', String(index + 2));
      row.setAttribute('aria-selected', String(commit.hash === state.selected));
      if (state.dim && !commit.onHead) row.classList.add('dim');

      const graph = element('div', 'cell graph');
      graph.setAttribute('role', 'gridcell');
      graph.appendChild(graphNode(state.graph[graphIndex] || { mine: 0, color: colors[0], pass: [], incoming: [], outgoing: [] }, flipped));
      row.appendChild(graph);

      const subject = element('div', 'cell subject');
      subject.setAttribute('role', 'gridcell');
      const title = element('span', 'subject-text', commit.subject);
      title.title = commit.subject;
      subject.appendChild(title);
      commit.refs.slice(0, 2).forEach(ref => {
        const name = text(typeof ref === 'object' ? ref.name : ref);
        const chip = element('span', 'chip', name);
        chip.title = name;
        subject.appendChild(chip);
      });
      if (commit.refs.length > 2) {
        const overflow = commit.refs.slice(2).map(ref => text(typeof ref === 'object' ? ref.name : ref));
        const chip = element('span', 'chip', '+' + overflow.length);
        chip.title = overflow.join(', ');
        subject.appendChild(chip);
      }
      row.appendChild(subject);

      const author = element('div', 'cell author', commit.author);
      author.setAttribute('role', 'gridcell');
      author.title = commit.author;
      row.appendChild(author);

      const date = element('div', 'cell date', formatDate(commit.date));
      date.setAttribute('role', 'gridcell');
      date.title = commit.date;
      row.appendChild(date);

      // The build state comes from the CI of the commit. Nothing is invented:
      // a commit without a check keeps the cell empty.
      const check = state.checks[commit.hash];
      const build = element('div', 'cell build');
      build.setAttribute('role', 'gridcell');
      if (check) {
        build.appendChild(createIcon(check.state === 'passed' ? 'CheckCircle2' : check.state === 'failed' ? 'XCircle' : 'Clock', 14));
        build.setAttribute('aria-label', 'Build ' + check.state);
        build.title = check.total + ' check' + (check.total === 1 ? '' : 's') + ': ' + check.passed + ' passed, ' + check.failed + ' failed';
        build.classList.add('build-' + check.state);
      }
      row.appendChild(build);

      row.addEventListener('click', () => selectCommit(commit.hash));
      row.addEventListener('contextmenu', event => {
        event.preventDefault();
        selectCommit(commit.hash);
        openMenu(event.clientX, event.clientY, commit);
      });
      spacer.appendChild(row);
    }

    $('grid').setAttribute('aria-rowcount', String(view.length + 1));
    scheduleCheckLoad(view, start, end);
    if (state.selected && document.getElementById('commit-' + state.selected)) {
      $('grid').setAttribute('aria-activedescendant', 'commit-' + state.selected);
    } else {
      $('grid').removeAttribute('aria-activedescendant');
    }
    $('copy').hidden = !state.selected;
  }

  /**
   * Loads the CI status for the rows that are on screen.
   *
   * The request is debounced and limited to the visible window, so scrolling
   * does not ask the host for the whole history.
   */
  let checkTimer = null;
  function scheduleCheckLoad(view, start, end) {
    clearTimeout(checkTimer);
    // Only ask for commits whose status is still unknown. Every commit costs a
    // request to the CI provider, so scrolling back and forth must not repeat
    // the ones already resolved.
    const visible = view
      .slice(start, end)
      .map((commit) => commit.hash)
      .filter((hash) => !state.checks[hash]);
    if (!visible.length) return;
    checkTimer = setTimeout(async () => {
      const generation = ++state.checkGeneration;
      try {
        const result = await call('git:checks', { hashes: visible });
        if (generation !== state.checkGeneration) return;
        const checks = result && result.checks ? result.checks : {};
        let changed = false;
        for (const [hash, value] of Object.entries(checks)) {
          if (!state.checks[hash]) changed = true;
          state.checks[hash] = value;
        }
        if (changed) renderRows();
      } catch {
        // No CI source for this repository: the column simply stays empty.
      }
    }, 250);
  }

  function refName(ref) {
    return text(typeof ref === 'object' ? ref.name : ref);
  }

  // Expansion state is kept across keystrokes and reloads (review item: the
  // tree must not reset the user's manual expand/collapse on every render).
  const collapsedGroups = new Set();

  /**
   * Splits `feat/ui/button` into a folder path and a leaf so branches nest the
   * way the reference layout shows them (`feat` folder, then its branches).
   */
  function buildBranchTree(names) {
    const root = { folders: new Map(), leaves: [] };
    names.forEach(name => {
      const parts = name.split('/');
      let node = root;
      parts.slice(0, -1).forEach(part => {
        if (!node.folders.has(part)) node.folders.set(part, { folders: new Map(), leaves: [] });
        node = node.folders.get(part);
      });
      node.leaves.push({ name, label: parts[parts.length - 1] });
    });
    return root;
  }

  function appendBranchButton(container, leaf, depth, isHead) {
    const button = element('button', 'branch-leaf');
    button.style.paddingLeft = (12 + depth * 14) + 'px';
    button.setAttribute('role', 'treeitem');
    button.setAttribute('aria-selected', String(state.ref === leaf.name));
    button.appendChild(createIcon('GitBranch', 13));
    button.appendChild(element('span', 'leaf-label', leaf.label));
    if (isHead) button.appendChild(element('span', 'leaf-head', 'HEAD'));
    button.title = leaf.name;
    button.addEventListener('click', () => {
      state.ref = state.ref === leaf.name ? '' : leaf.name;
      $('filter-branch-input').value = state.ref;
      renderTree();
      reload();
    });
    container.appendChild(button);
  }

  function appendFolder(container, key, label, node, depth, forceOpen, headName) {
    const open = forceOpen || !collapsedGroups.has(key);
    const header = element('button', 'tree-folder');
    header.style.paddingLeft = (12 + depth * 14) + 'px';
    header.setAttribute('role', 'treeitem');
    header.setAttribute('aria-expanded', String(open));
    header.appendChild(createIcon(open ? 'ChevronDown' : 'ChevronRight', 13));
    header.appendChild(createIcon('Folder', 13));
    header.appendChild(element('span', 'leaf-label', label));
    header.addEventListener('click', () => {
      if (collapsedGroups.has(key)) collapsedGroups.delete(key); else collapsedGroups.add(key);
      renderTree();
    });
    container.appendChild(header);
    if (!open) return;
    node.leaves.forEach(leaf => appendBranchButton(container, leaf, depth + 1, leaf.name === headName));
    node.folders.forEach((child, childLabel) =>
      appendFolder(container, key + '/' + childLabel, childLabel, child, depth + 1, forceOpen, headName));
  }

  function renderTree() {
    const tree = $('tree');
    tree.replaceChildren();
    const search = $('branch-search').value.trim().toLowerCase();
    const headName = state.headBranch || '';
    const groups = [
      ['Local', 'branches', state.refs.branches || [], 'GitBranch'],
      ['Remote', 'remotes', state.refs.remotes || [], 'Download'],
      ['Tags', 'tags', state.refs.tags || [], 'Folder'],
    ];
    let count = 0;

    if (headName) {
      const head = element('button', 'tree-head');
      head.setAttribute('role', 'treeitem');
      head.appendChild(createIcon('GitBranch', 13));
      head.appendChild(element('span', 'leaf-label', 'HEAD (' + headName + ')'));
      head.addEventListener('click', () => { state.ref = ''; $('filter-branch-input').value = ''; renderTree(); reload(); });
      tree.appendChild(head);
    }

    groups.forEach(([label, key, refs, iconName]) => {
      if (!Array.isArray(refs)) return;
      const names = refs.map(refName).filter(name => !search || name.toLowerCase().includes(search));
      if (!names.length) return;
      count += names.length;
      // A filter that matches opens every group so the match is never hidden.
      appendFolder(tree, key, label + ' (' + names.length + ')', buildBranchTree(names), 0, Boolean(search), headName);
    });

    if (!count) tree.appendChild(element('p', 'empty', search ? 'No branches match.' : 'No references found.'));
  }

  function filters() {
    return {
      ref: $('filter-branch-input').value.trim() || state.ref || undefined,
      q: $('search').value.trim() || undefined,
      author: $('filter-author-input').value.trim() || undefined,
      path: $('path').value.trim() || undefined,
      since: $('since').value || undefined,
      until: $('until').value || undefined,
      caseSensitive: state.caseSensitive,
      regex: state.regex,
      limit: 250,
    };
  }

  function updateStatusBar() {
    const branch = state.ref || state.headBranch || 'HEAD';
    $('branch-status').textContent = branch;
    $('count-status').textContent = state.commits.length
      ? state.commits.length + ' of ' + state.commits.length + ' commits shown'
      : '';
  }

  async function loadPage(reset) {
    if (state.loading && !reset) return;
    const generation = reset ? ++state.generation : state.generation;
    state.loading = true;
    $('more').hidden = true;
    showStatus('Loading commits…');
    try {
      const result = await call('git:log', { ...filters(), ...(reset ? {} : { cursor: state.cursor }) });
      if (generation !== state.generation) return;
      if (!result || !Array.isArray(result.commits)) throw new Error('Invalid Git log response');

      const commits = result.commits.map(normalizeCommit).filter(commit => commit.hash);
      if (reset) {
        state.commits = commits;
        state.tip = text(result.tip);
      } else {
        const known = new Set(state.commits.map(commit => commit.hash));
        state.commits = state.commits.concat(commits.filter(commit => !known.has(commit.hash)));
      }
      state.cursor = result.nextCursor || null;
      const headCommit = state.commits.find(commit => commit.hash === state.tip);
      const headRef = headCommit && headCommit.refs.map(refName).find(name => name.startsWith('HEAD -> '));
      if (headRef) {
        state.headBranch = headRef.slice('HEAD -> '.length);
        renderTree();
      }
      state.graph = layoutGraph(state.commits);

      if (reset) {
        $('list').scrollTop = 0;
        if (!state.commits.some(commit => commit.hash === state.selected)) {
          state.selected = null;
          clearDetail();
        }
      }
      renderRows();
      $('more').hidden = !state.cursor;
      updateStatusBar();
      showStatus(state.commits.length ? state.commits.length + ' commits loaded' : 'No commits match the current filters.');
    } catch (error) {
      if (generation !== state.generation) return;
      if (error.code === 'GIT_WORKSPACE_DENIED') {
        showStatus('Waiting for the project workspace…');
        return;
      }
      if (error.code === 'GIT_STALE_CURSOR') {
        // The repository moved to a new tip: restart from the first page.
        state.cursor = null;
        await loadPage(true);
        return;
      }
      showStatus(error.message || 'Unable to load history', true);
      $('more').hidden = !state.cursor;
    } finally {
      if (generation === state.generation) state.loading = false;
    }
  }

  function clearDetail() {
    state.detailGeneration += 1;
    $('count').textContent = '';
    $('files').replaceChildren(element('p', 'empty', 'Select a commit to view its changes.'));
    $('detail').replaceChildren(element('p', 'empty', 'Select a commit to view its details.'));
    $('copy').hidden = true;
  }

  async function selectCommit(hash) {
    state.selected = hash;
    renderRows();
    const generation = ++state.detailGeneration;
    $('files').replaceChildren(element('p', 'empty', 'Loading changes…'));
    $('detail').replaceChildren(element('p', 'empty', 'Loading commit…'));
    try {
      const result = await call('git:commit', { hash });
      if (generation !== state.detailGeneration) return;
      const commit = result.commit || result;
      if (!commit || typeof commit !== 'object') throw new Error('Invalid commit response');
      const files = Array.isArray(commit.files) ? commit.files : [];
      $('count').textContent = String(files.length);
      $('files').replaceChildren();
      if (!files.length) $('files').appendChild(element('p', 'empty', 'No changed files.'));
      files.forEach(file => {
        const row = element('div', 'file');
        const status = text(file.status || '');
        row.appendChild(element('span', 'file-status' + (status.startsWith('D') ? ' deleted' : ''), status));
        row.appendChild(element('span', '', file.path || file.name));
        $('files').appendChild(row);
      });

      const data = normalizeCommit(commit);
      const detail = $('detail');
      detail.replaceChildren(element('p', 'detail-title', data.subject));
      const grid = element('div', 'kv');
      [
        ['Hash', data.hash || hash],
        ['Author', data.author],
        ['Date', data.date],
        ['Parents', data.parents.join(', ') || 'none'],
        ['Refs', data.refs.map(refName).join(', ') || 'none'],
      ].forEach(([label, value]) => {
        grid.appendChild(element('span', 'label', label));
        grid.appendChild(element('span', label === 'Hash' || label === 'Parents' ? 'mono' : '', value));
      });
      detail.appendChild(grid);
      if (commit.body) detail.appendChild(element('p', 'body-text', commit.body));
    } catch (error) {
      if (generation !== state.detailGeneration) return;
      $('files').replaceChildren(element('p', 'error', error.message));
      $('detail').replaceChildren(element('p', 'error', 'Unable to load commit details.'));
    }
  }

  /**
   * Reloads the history and the reference tree.
   *
   * The host binds the workspace, and that binding can arrive after the plugin
   * starts (the host resolves the active project asynchronously). A workspace
   * that is not bound yet is therefore retried a few times instead of leaving a
   * dead view behind.
   */
  async function reload(attempt = 0) {
    const generation = state.generation + 1;
    loadPage(true);
    try {
      const refs = await call('git:refs');
      if (generation !== state.generation) return;
      state.refs = refs || {};
      state.headBranch = state.headBranch || '';
      renderTree();
    } catch (error) {
      if (generation !== state.generation) return;
      if (error.code === 'GIT_WORKSPACE_DENIED' && attempt < 5) {
        showStatus('Waiting for the project workspace…');
        setTimeout(() => reload(attempt + 1), 1000);
        return;
      }
      $('tree').replaceChildren(element('p', 'error', error.message || 'Unable to load references.'));
    }
  }

  function scrollToCommit(hash) {
    const index = viewCommits().findIndex(commit => commit.hash === hash);
    if (index < 0) return;
    const list = $('list');
    const top = index * rowHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (top + rowHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + rowHeight - list.clientHeight;
    selectCommit(hash);
  }

  function openMenu(x, y, commit) {
    const menu = $('menu');
    menu.replaceChildren();
    [
      ['Copy hash', () => copyText(commit.hash)],
      ['Copy subject', () => copyText(commit.subject)],
      ['Show commit details', () => $('detail').focus()],
    ].forEach(([label, action]) => {
      const item = element('button', 'menu-item', label);
      item.setAttribute('role', 'menuitem');
      item.setAttribute('tabindex', '-1');
      item.addEventListener('click', () => { action(); closeMenu(); });
      menu.appendChild(item);
    });
    menu.hidden = false;
    const rect = menu.getBoundingClientRect();
    const left = Math.max(4, Math.min(x, window.innerWidth - rect.width - 4));
    const top = Math.max(4, Math.min(y, window.innerHeight - rect.height - 4));
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    const first = menu.querySelector('.menu-item');
    if (first) {
      first.setAttribute('tabindex', '0');
      first.focus();
    }
    menu.onkeydown = event => {
      const items = Array.from(menu.querySelectorAll('.menu-item'));
      if (!items.length) return;
      const index = items.indexOf(document.activeElement);
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        items[(index + 1 + items.length) % items.length].focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        items[(index - 1 + items.length) % items.length].focus();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu();
      }
    };
  }

  function closeMenu() {
    const menu = $('menu');
    if (menu.hidden) return;
    menu.hidden = true;
    menu.replaceChildren();
  }

  async function copyText(value) {
    const payload = text(value);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(payload);
      } else {
        const area = document.createElement('textarea');
        area.value = payload;
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
      }
      showStatus('Copied to clipboard.');
    } catch {
      showStatus('Copy failed. Select the text manually.', true);
    }
  }

  function copySelectedHash() {
    const commit = viewCommits().find(entry => entry.hash === state.selected);
    if (!commit) return;
    copyText(commit.hash);
  }

  function installSplitter(id, side) {
    const splitter = $(id);
    const layout = $('layout');
    if (!splitter || !layout) return;

    const apply = value => {
      const min = side === 'left' ? 150 : 220;
      const max = side === 'left' ? 420 : 520;
      const clamped = Math.min(max, Math.max(min, value));
      const columns = getComputedStyle(layout).gridTemplateColumns
        .split(' ')
        .filter(Boolean)
        .map(entry => parseFloat(entry) || 0);
      // The layout has five tracks: branches, splitter, history, splitter, details.
      const paneIndex = side === 'left' ? 0 : 4;
      const historyIndex = 2;
      if (columns.length !== 5 || !columns[paneIndex] || !columns[historyIndex]) return;
      splitterState[side] = clamped;
      const delta = clamped - columns[paneIndex];
      const next = columns.slice();
      next[paneIndex] = clamped;
      next[historyIndex] = Math.max(240, next[historyIndex] - delta);
      layout.style.gridTemplateColumns = next.map(entry => Math.round(entry) + 'px').join(' ');
      splitter.setAttribute('aria-valuenow', String(Math.round(clamped)));
    };

    splitter.addEventListener('pointerdown', event => {
      event.preventDefault();
      splitter.setPointerCapture(event.pointerId);
      const startX = event.clientX;
      const startWidth = splitterState[side];
      const move = moveEvent => apply(startWidth + (moveEvent.clientX - startX));
      const up = () => {
        splitter.removeEventListener('pointermove', move);
        splitter.removeEventListener('pointerup', up);
      };
      splitter.addEventListener('pointermove', move);
      splitter.addEventListener('pointerup', up);
    });

    splitter.addEventListener('keydown', event => {
      const step = event.shiftKey ? 40 : 12;
      if (event.key === 'ArrowLeft') { apply(splitterState[side] - step); event.preventDefault(); }
      else if (event.key === 'ArrowRight') { apply(splitterState[side] + step); event.preventDefault(); }
      else if (event.key === 'Home') { apply(150); event.preventDefault(); }
      else if (event.key === 'End') { apply(side === 'left' ? 420 : 520); event.preventDefault(); }
    });

    splitter.addEventListener('dblclick', () => apply(side === 'left' ? 220 : 300));
  }

  function installDetailsSplitter() {
    const splitter = $('right-hsplit');
    const panes = $('right-panes');
    if (!splitter || !panes) return;

    const apply = value => {
      const clamped = Math.min(520, Math.max(120, value));
      splitterState.details = clamped;
      panes.style.gridTemplateRows = `minmax(0, 1fr) 4px ${Math.round(clamped)}px`;
      splitter.setAttribute('aria-valuenow', String(Math.round(clamped)));
    };

    splitter.addEventListener('pointerdown', event => {
      event.preventDefault();
      splitter.setPointerCapture(event.pointerId);
      const startY = event.clientY;
      const startHeight = splitterState.details;
      const move = moveEvent => apply(startHeight - (moveEvent.clientY - startY));
      const up = () => {
        splitter.removeEventListener('pointermove', move);
        splitter.removeEventListener('pointerup', up);
      };
      splitter.addEventListener('pointermove', move);
      splitter.addEventListener('pointerup', up);
    });

    splitter.addEventListener('keydown', event => {
      const step = event.shiftKey ? 40 : 12;
      if (event.key === 'ArrowUp') { apply(splitterState.details + step); event.preventDefault(); }
      else if (event.key === 'ArrowDown') { apply(splitterState.details - step); event.preventDefault(); }
      else if (event.key === 'Home') { apply(520); event.preventDefault(); }
      else if (event.key === 'End') { apply(120); event.preventDefault(); }
    });

    splitter.addEventListener('dblclick', () => apply(280));
  }

  function toggleCollapse() {
    state.collapsed = !state.collapsed;
    const layout = $('layout');
    layout.classList.toggle('collapsed', state.collapsed);
    const button = $('collapse');
    button.setAttribute('aria-pressed', String(state.collapsed));
    button.replaceChildren(createIcon(state.collapsed ? 'ChevronRight' : 'ChevronLeft', 14));
  }

  function toggleFilterPanel(buttonId, fieldId) {
    const button = $(buttonId);
    const field = $(fieldId);
    const panel = $('filter-panel');
    const wasActive = button.getAttribute('aria-pressed') === 'true';
    panel.hidden = wasActive;
    button.setAttribute('aria-pressed', String(!wasActive));
    if (!wasActive && field) field.focus();
  }

  $('list').addEventListener('scroll', renderRows);
  $('grid').addEventListener('keydown', event => {
    if (event.target.closest('input, textarea, [contenteditable]')) return;
    const view = viewCommits();
    const index = Math.max(0, view.findIndex(commit => commit.hash === state.selected));
    let target = index;
    if (event.key === 'ArrowDown') target += 1;
    else if (event.key === 'ArrowUp') target -= 1;
    else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = view.length - 1;
    else if (event.key === 'PageDown') target += Math.max(1, Math.floor($('list').clientHeight / rowHeight));
    else if (event.key === 'PageUp') target -= Math.max(1, Math.floor($('list').clientHeight / rowHeight));
    else return;
    if (!view.length) return;
    event.preventDefault();
    target = Math.max(0, Math.min(view.length - 1, target));
    scrollToCommit(view[target].hash);
  });

  $('refresh').addEventListener('click', reload);

  $('fetched-close').addEventListener('click', () => { $('fetched').hidden = true; });

  $('fetch').addEventListener('click', async () => {
    showStatus('Fetching from remotes…');
    const card = $('fetched');
    card.hidden = false;
    $('fetched-detail').textContent = 'Contacting remotes…';
    try {
      // The host runs a dry-run fetch, so the remotes are contacted but no ref
      // is updated, and the card reports how far the branch is from its upstream.
      const status = await call('git:remoteStatus');
      const upstream = status?.upstream || 'no upstream';
      const detail = upstream + ' · ' + (status?.down || 0) + ' down, ' + (status?.up || 0) + ' up';
      $('fetched-detail').textContent = detail;
      showStatus('Fetched. No references were changed.');
    } catch (error) {
      $('fetched-detail').textContent = error.message || 'Fetch failed.';
      showStatus(error.message || 'Fetch failed.', true);
    }
  });

  $('more').addEventListener('click', () => loadPage(false));
  $('copy').addEventListener('click', copySelectedHash);
  $('branch-search').addEventListener('input', renderTree);
  $('collapse').addEventListener('click', toggleCollapse);

  $('dim').addEventListener('click', () => {
    state.dim = !state.dim;
    $('dim').setAttribute('aria-pressed', String(state.dim));
    renderRows();
  });

  $('case').addEventListener('click', () => {
    state.caseSensitive = !state.caseSensitive;
    $('case').setAttribute('aria-pressed', String(state.caseSensitive));
    reload();
  });

  $('regex').addEventListener('click', () => {
    state.regex = !state.regex;
    $('regex').setAttribute('aria-pressed', String(state.regex));
    reload();
  });

  $('sort').addEventListener('click', () => {
    state.sort = state.sort === 'asc' ? 'desc' : 'asc';
    $('sort').setAttribute('aria-pressed', String(state.sort === 'asc'));
    $('sort').setAttribute('title', state.sort === 'asc' ? 'Sort: oldest first' : 'Sort: newest first');
    const selected = state.selected;
    renderRows();
    if (selected) scrollToCommit(selected);
  });

  $('head').addEventListener('click', () => {
    const head = viewCommits().find(commit => commit.hash === state.tip);
    if (head) scrollToCommit(head.hash);
    else showStatus('The HEAD commit is not in the loaded history.', true);
  });

  $('filter-branch').addEventListener('click', () => toggleFilterPanel('filter-branch', 'filter-branch-input'));
  $('filter-author').addEventListener('click', () => toggleFilterPanel('filter-author', 'filter-author-input'));
  $('filter-date').addEventListener('click', () => toggleFilterPanel('filter-date', 'since'));
  $('filter-path').addEventListener('click', () => toggleFilterPanel('filter-path', 'path'));

  $('filter-clear').addEventListener('click', () => {
    $('filter-branch-input').value = '';
    $('filter-author-input').value = '';
    $('path').value = '';
    $('since').value = '';
    $('until').value = '';
    state.ref = '';
    reload();
  });

  let filterTimer;
  ['search', 'filter-branch-input', 'filter-author-input', 'path', 'since', 'until'].forEach(id => {
    $(id).addEventListener('input', () => {
      clearTimeout(filterTimer);
      filterTimer = setTimeout(reload, 250);
    });
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeMenu();
  });
  document.addEventListener('click', event => {
    const menu = $('menu');
    if (menu.hidden) return;
    if (!menu.contains(event.target)) closeMenu();
  });

  iconButton('collapse', 'ChevronLeft', 'Collapse branch panel');
  iconButton('regex', 'Code', 'Use regular expression');
  iconButton('sort', 'ArrowUpDown', 'Toggle sort order');
  iconButton('dim', 'EyeOff', 'Dim commits not on HEAD');
  iconButton('head', 'Crosshair', 'Go to the HEAD commit');
  iconButton('refresh', 'RefreshCw', 'Reload history');
  iconButton('copy', 'Copy', 'Copy the selected commit hash');

  installSplitter('left-split', 'left');
  installSplitter('right-split', 'right');
  installDetailsSplitter();

  call('plugin:ready')
    .then(() => call('theme:subscribe').catch(() => {}))
    .then(reload)
    .catch(error => showStatus('Git Log unavailable: ' + error.message, true));
})();
