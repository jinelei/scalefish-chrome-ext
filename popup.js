const $ = (id) => document.getElementById(id)

document.addEventListener('DOMContentLoaded', async () => {
  const { backendUrl, apiToken } = await chrome.storage.sync.get(['backendUrl', 'apiToken'])

  if (!backendUrl || !apiToken) {
    $('unconfigured').style.display = 'block'
    $('mainForm').style.display = 'none'
    $('goConfigBtn').addEventListener('click', () => chrome.runtime.openOptionsPage())
    return
  }

  $('configBtn').addEventListener('click', () => chrome.runtime.openOptionsPage())

  // Get current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  $('pageTitle').textContent = tab.title || '-'
  $('pageUrl').textContent = tab.url || '-'

  // Load categories and tags
  await Promise.all([loadCategories(backendUrl, apiToken), loadTags(backendUrl, apiToken)])

  // Save
  $('saveBtn').addEventListener('click', () => saveBookmark(backendUrl, apiToken, tab))
})

async function api(url, token, path, options = {}) {
  const res = await fetch(`${url}${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`HTTP ${res.status}: ${body}`)
  }
  return res.json()
}

async function loadCategories(url, token) {
  try {
    const { data: tree } = await api(url, token, '/categories')
    const select = $('categorySelect')
    flattenCategories(tree).forEach((c) => {
      const opt = document.createElement('option')
      opt.value = c.id
      opt.textContent = c.label
      select.appendChild(opt)
    })
  } catch (e) {
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

  $('saveBtn').disabled = true
  showStatus('保存中...', 'loading')

  try {
    await api(url, token, '/bookmarks', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    showStatus('✅ 书签已保存！', 'success')
  } catch (e) {
    showStatus('保存失败: ' + e.message, 'error')
    $('saveBtn').disabled = false
  }
}

function showStatus(msg, type) {
  const el = $('status')
  el.textContent = msg
  el.className = type
}
