const log = {
  _prefix: (level) => {
    const ts = new Date().toISOString().slice(11, 23)
    return `[${ts}] [${level}] [popup]`
  },
  debug: (...args) => console.debug(log._prefix('DEBUG'), ...args),
  info: (...args) => console.info(log._prefix('INFO'), ...args),
  warn: (...args) => console.warn(log._prefix('WARN'), ...args),
  error: (...args) => console.error(log._prefix('ERROR'), ...args),
}

const $ = (id) => document.getElementById(id)

document.addEventListener('DOMContentLoaded', async () => {
  log.debug('DOMContentLoaded')
  const { backendUrl, apiToken } = await chrome.storage.sync.get(['backendUrl', 'apiToken'])

  if (!backendUrl || !apiToken) {
    log.warn('Backend not configured')
    $('unconfigured').style.display = 'block'
    $('mainForm').style.display = 'none'
    $('goConfigBtn').addEventListener('click', () => chrome.runtime.openOptionsPage())
    return
  }

  log.info('Initialized with backend: %s', backendUrl)

  $('configBtn').addEventListener('click', () => chrome.runtime.openOptionsPage())

  // Get current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  $('pageTitle').textContent = tab.title || '-'
  $('pageUrl').textContent = tab.url || '-'
  log.debug('Current tab: title="%s", url="%s"', tab.title, tab.url)

  // Load categories and tags
  await Promise.all([loadCategories(backendUrl, apiToken), loadTags(backendUrl, apiToken)])

  // Save
  $('saveBtn').addEventListener('click', () => saveBookmark(backendUrl, apiToken, tab))
})

async function api(url, token, path, options = {}) {
  log.debug('API: %s %s%s', options.method || 'GET', url, path)
  const res = await fetch(`${url}${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const body = await res.text()
    log.warn('API failed: %d %s', res.status, body)
    throw new Error(`HTTP ${res.status}: ${body}`)
  }
  return res.json()
}

async function loadCategories(url, token) {
  try {
    const { data: tree } = await api(url, token, '/categories')
    log.debug('Loaded %d categories', tree.length)
    const select = $('categorySelect')
    flattenCategories(tree).forEach((c) => {
      const opt = document.createElement('option')
      opt.value = c.id
      opt.textContent = c.label
      select.appendChild(opt)
    })
  } catch (e) {
    log.error('Failed to load categories:', e.message)
    showStatus('加载分类失败: ' + e.message, 'error')
  }
}

function flattenCategories(cats, parentPath = []) {
  const result = []
  for (const c of cats) {
    const label = parentPath.length > 0 ? `${parentPath.join(' › ')} › ${c.name}` : c.name
    result.push({ id: c.id, label })
    if (c.children?.length) {
      result.push(...flattenCategories(c.children, [...parentPath, c.name]))
    }
  }
  return result
}

async function loadTags(url, token) {
  try {
    const { data: tags } = await api(url, token, '/tags')
    log.debug('Loaded %d tags', tags.length)
    const container = $('tagList')
    container.innerHTML = ''
    if (!tags.length) {
      container.innerHTML = '<span class="empty">暂无标签</span>'
      return
    }
    tags.forEach((t) => {
      const label = document.createElement('label')
      label.innerHTML = `<input type="checkbox" value="${t.id}" /><span># ${t.name}</span>`
      container.appendChild(label)
    })
  } catch (e) {
    log.error('Failed to load tags:', e.message)
    showStatus('加载标签失败: ' + e.message, 'error')
  }
}

async function saveBookmark(url, token, tab) {
  const categoryId = $('categorySelect').value
  const tagIds = Array.from(document.querySelectorAll('#tagList input:checked')).map((cb) => Number(cb.value))

  const body = {
    title: tab.title || tab.url,
    url: tab.url,
    categoryId: categoryId ? Number(categoryId) : null,
    tagIds: tagIds.length ? tagIds : [],
  }

  log.info('Saving bookmark: title="%s", url="%s"', body.title, body.url)

  $('saveBtn').disabled = true
  showStatus('保存中...', 'loading')

  try {
    await api(url, token, '/bookmarks', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    log.info('Bookmark saved successfully')
    showStatus('✅ 书签已保存！', 'success')
  } catch (e) {
    log.error('Failed to save bookmark:', e.message)
    showStatus('保存失败: ' + e.message, 'error')
    $('saveBtn').disabled = false
  }
}

function showStatus(msg, type) {
  const el = $('status')
  el.textContent = msg
  el.className = type
}
