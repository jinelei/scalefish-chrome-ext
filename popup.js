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
  const { backendUrl, apiToken, homeUrl } = await chrome.storage.sync.get(['backendUrl', 'apiToken', 'homeUrl'])

  if (homeUrl) {
    $('logoLink').addEventListener('click', () => chrome.tabs.create({ url: homeUrl }))
    $('logoLink').title = '打开主页'
  }

  if (!backendUrl || !apiToken) {
    log.warn('Backend not configured')
    $('unconfigured').style.display = 'block'
    $('mainForm').style.display = 'none'
    $('logoLink').style.cursor = 'default'
    $('goConfigBtn').addEventListener('click', () => chrome.runtime.openOptionsPage())
    return
  }

  log.info('Initialized with backend: %s', backendUrl)

  // Fetch display name from backend
  try {
    const configRes = await api(backendUrl, apiToken, '/app-config').catch(() => null)
    if (configRes?.data?.display_name) {
      $('appName').textContent = configRes.data.display_name
    }
  } catch (_) {}

  $('configBtn').addEventListener('click', () => chrome.runtime.openOptionsPage())

  // Get current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  $('pageTitle').textContent = tab.title || '-'
  $('pageUrl').textContent = tab.url || '-'
  log.debug('Current tab: title="%s", url="%s"', tab.title, tab.url)

  // Load categories and tags
  await Promise.all([loadCategories(backendUrl, apiToken), loadTags(backendUrl, apiToken)])

  // Inline category creation
  $('addCategoryBtn').addEventListener('click', () => {
    $('newCategoryForm').style.display = 'flex'
    $('newCategoryInput').focus()
  })
  $('cancelCategoryBtn').addEventListener('click', () => {
    $('newCategoryForm').style.display = 'none'
    $('newCategoryInput').value = ''
  })
  $('confirmCategoryBtn').addEventListener('click', () => createAndSelectCategory(backendUrl, apiToken))
  $('newCategoryInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createAndSelectCategory(backendUrl, apiToken)
  })

  // Inline tag creation
  $('addTagBtn').addEventListener('click', () => {
    $('newTagForm').style.display = 'flex'
    $('newTagInput').focus()
  })
  $('cancelTagBtn').addEventListener('click', () => {
    $('newTagForm').style.display = 'none'
    $('newTagInput').value = ''
  })
  $('confirmTagBtn').addEventListener('click', () => createAndSelectTag(backendUrl, apiToken))
  $('newTagInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createAndSelectTag(backendUrl, apiToken)
  })

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
    const err = new Error(`HTTP ${res.status}: ${body}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

function isAuthError(e) {
  return e.status === 401 || e.status === 403
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
    handleLoadError('分类', e)
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
    handleLoadError('标签', e)
  }
}

function handleLoadError(name, e) {
  if (e.status === 401) {
    showActionStatus(`⚠️ ${name}加载失败：Token 已失效，请重新配置`, 'error')
  } else if (e.status === 403) {
    showActionStatus(`⚠️ ${name}加载失败：服务器拒绝请求（403）\n${e.message}`, 'error')
  } else if (e.message && e.message.includes('Failed to fetch')) {
    showStatus(`⚠️ ${name}加载失败：无法连接到后端，请检查地址或网络`, 'error')
  } else {
    showStatus(`${name}加载失败: ` + e.message, 'error')
  }
}

function showActionStatus(msg, type) {
  const el = $('status')
  el.className = type
  el.innerHTML = msg.replace(/\n/g, '<br>')
  if (!document.getElementById('statusConfigBtn')) {
    const btn = document.createElement('button')
    btn.id = 'statusConfigBtn'
    btn.className = 'btn-config'
    btn.textContent = '重新配置'
    btn.style.cssText = 'flex:none;padding:3px 8px;font-size:11px;margin-top:6px;display:inline-block'
    btn.addEventListener('click', () => chrome.runtime.openOptionsPage())
    el.appendChild(document.createElement('br'))
    el.appendChild(btn)
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
    if (e.status === 401) {
      showActionStatus('⚠️ 保存失败：Token 已失效，请重新配置', 'error')
    } else if (e.status === 403) {
      showActionStatus('⚠️ 保存失败：服务器拒绝请求（403）\n' + e.message, 'error')
    } else {
      showStatus('保存失败: ' + e.message, 'error')
    }
    $('saveBtn').disabled = false
  }
}

async function createAndSelectCategory(url, token) {
  const input = $('newCategoryInput')
  const name = input.value.trim()
  if (!name) return

  $('confirmCategoryBtn').disabled = true
  try {
    const { data: cat } = await api(url, token, '/categories', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
    const opt = document.createElement('option')
    opt.value = cat.id
    opt.textContent = cat.name
    $('categorySelect').appendChild(opt)
    $('categorySelect').value = cat.id
    $('newCategoryForm').style.display = 'none'
    input.value = ''
    log.info('Category created: id=%d, name="%s"', cat.id, cat.name)
  } catch (e) {
    log.error('Failed to create category:', e.message)
    showStatus('创建分类失败: ' + e.message, 'error')
  } finally {
    $('confirmCategoryBtn').disabled = false
  }
}

async function createAndSelectTag(url, token) {
  const input = $('newTagInput')
  const name = input.value.trim()
  if (!name) return

  $('confirmTagBtn').disabled = true
  try {
    const { data: tag } = await api(url, token, '/tags', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
    const label = document.createElement('label')
    label.innerHTML = `<input type="checkbox" value="${tag.id}" checked /><span># ${tag.name}</span>`
    $('tagList').appendChild(label)
    $('newTagForm').style.display = 'none'
    input.value = ''
    log.info('Tag created: id=%d, name="%s"', tag.id, tag.name)
  } catch (e) {
    log.error('Failed to create tag:', e.message)
    showStatus('创建标签失败: ' + e.message, 'error')
  } finally {
    $('confirmTagBtn').disabled = false
  }
}

function showStatus(msg, type) {
  const el = $('status')
  el.className = type
  el.innerHTML = msg
}
