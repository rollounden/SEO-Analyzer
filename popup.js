document.addEventListener('DOMContentLoaded', function() {
  // Tab switching
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', function() {
      const tabId = this.getAttribute('data-tab');
      
      // Remove active class from all tabs and contents
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      // Add active class to clicked tab and corresponding content
      this.classList.add('active');
      document.getElementById(tabId).classList.add('active');
    });
  });
  
  // Analyze the current tab
  analyzeCurrentPage();
  
  // Set up button events
  document.getElementById('copy-headings').addEventListener('click', copyHeadings);
  document.getElementById('export-links').addEventListener('click', exportLinks);
  
  // Set up link filter events
  document.getElementById('hide-duplicates').addEventListener('change', filterLinks);
  document.getElementById('hide-internal').addEventListener('change', filterLinks);
  document.getElementById('group-domains').addEventListener('change', filterLinks);
  document.getElementById('show-full-list').addEventListener('change', filterLinks);
  
  // Set up agency link
  document.getElementById('agency-link').addEventListener('click', function(e) {
    e.preventDefault();
    chrome.tabs.create({ url: 'https://apexmarketing.co.uk' });
  });
});

function analyzeCurrentPage() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const activeTab = tabs[0];
    chrome.scripting.executeScript({
      target: {tabId: activeTab.id},
      function: getPageData,
    }, displayResults);
  });
}

function getPageData() {
  const data = {};
  
  // Basic SEO data
  data.title = document.title || '';
  data.url = window.location.href;
  data.lang = document.documentElement.lang || 'Not specified';
  
  // Meta tags
  const metaTags = document.getElementsByTagName('meta');
  data.description = '';
  data.keywords = '';
  data.robots = '';
  data.canonical = '';
  data.ogData = {};
  data.twitterData = {};
  
  for (let i = 0; i < metaTags.length; i++) {
    const meta = metaTags[i];
    const name = meta.getAttribute('name');
    const property = meta.getAttribute('property');
    const content = meta.getAttribute('content') || '';
    
    if (name === 'description') {
      data.description = content;
    } else if (name === 'keywords') {
      data.keywords = content;
    } else if (name === 'robots') {
      data.robots = content;
    } else if (property && property.startsWith('og:')) {
      data.ogData[property.substring(3)] = content;
    } else if (name && name.startsWith('twitter:')) {
      data.twitterData[name.substring(8)] = content;
    }
  }
  
  // Get canonical link
  const canonicalLink = document.querySelector('link[rel="canonical"]');
  if (canonicalLink) {
    data.canonical = canonicalLink.href;
  }
  
  // Word count
  const bodyText = document.body.innerText || '';
  data.wordCount = bodyText.split(/\s+/).filter(word => word.length > 0).length;
  
  // Headings
  data.headings = {};
  for (let i = 1; i <= 6; i++) {
    const headings = document.querySelectorAll('h' + i);
    data.headings['h' + i] = {
      count: headings.length,
      items: Array.from(headings).map(h => h.innerText.trim())
    };
  }
  
  // Links
  const allLinks = document.querySelectorAll('a');
  const currentDomain = window.location.hostname;
  
  data.links = {
    total: allLinks.length,
    internal: 0,
    external: 0,
    items: []
  };
  
  allLinks.forEach(link => {
    const href = link.href || '';
    const anchor = link.innerText.trim() || 'No anchor text';
    const isInternal = href.includes(currentDomain) || href.startsWith('/');
    
    data.links.items.push({
      url: href,
      anchor: anchor,
      isInternal: isInternal
    });
    
    if (isInternal) {
      data.links.internal++;
    } else if (href.startsWith('http')) {
      data.links.external++;
    }
  });
  
  // Images
  const allImages = document.querySelectorAll('img');
  data.images = {
    total: allImages.length,
    missing_alt: 0,
    items: []
  };
  
  allImages.forEach(img => {
    const alt = img.alt || '';
    const src = img.src || '';
    
    if (!alt) {
      data.images.missing_alt++;
    }
    
    data.images.items.push({
      src: src,
      alt: alt,
      hasAlt: alt.length > 0
    });
  });
  
  return data;
}

function displayResults(results) {
  if (!results || !results[0] || !results[0].result) return;
  
  const data = results[0].result;
  
  // Overview tab
  document.getElementById('title-length').textContent = `${data.title.length} characters | ${data.title}`;
  document.getElementById('description-length').textContent = data.description ? 
    `${data.description.length} characters` : 'Missing';
  document.getElementById('url').textContent = data.url;
  document.getElementById('canonical').textContent = data.canonical || 'Missing';
  document.getElementById('robots').textContent = data.robots || 'Missing';
  document.getElementById('word-count').textContent = data.wordCount;
  document.getElementById('lang').textContent = data.lang;
  document.getElementById('keywords').textContent = data.keywords || 'Missing';
  
  // Headings tab
  for (let i = 1; i <= 6; i++) {
    document.getElementById(`h${i}-count`).textContent = data.headings[`h${i}`].count;
  }
  
  const headingsList = document.getElementById('headings-list');
  headingsList.innerHTML = '';
  
  for (let i = 1; i <= 6; i++) {
    const headings = data.headings[`h${i}`].items;
    if (headings.length > 0) {
      headings.forEach(heading => {
        const headingItem = document.createElement('div');
        headingItem.className = 'heading-item';
        headingItem.innerHTML = `<strong>H${i}:</strong> ${heading}`;
        headingsList.appendChild(headingItem);
      });
    }
  }
  
  // Links tab
  document.getElementById('total-links').textContent = data.links.total;
  document.getElementById('internal-links').textContent = data.links.internal;
  document.getElementById('external-links').textContent = data.links.external;

  // Store links data globally for filtering
  window.linksData = data.links;

  // Apply initial filtering
  filterLinks();
  
  // Images tab
  document.getElementById('total-images').textContent = data.images.total;
  document.getElementById('missing-alt').textContent = data.images.missing_alt;
  
  const imagesList = document.getElementById('images-list');
  imagesList.innerHTML = '';
  
  data.images.items.forEach(image => {
    const imageItem = document.createElement('div');
    imageItem.className = 'link-item';
    imageItem.innerHTML = `<div><strong>Alt:</strong> ${image.hasAlt ? image.alt : '<span class="missing">Missing</span>'}</div>
                           <div>${image.src}</div>`;
    imagesList.appendChild(imageItem);
  });
  
  // Social tab
  const ogData = document.getElementById('og-data');
  ogData.innerHTML = '';
  
  if (Object.keys(data.ogData).length === 0) {
    ogData.innerHTML = '<div class="missing">No Open Graph tags found</div>';
  } else {
    for (const [key, value] of Object.entries(data.ogData)) {
      const item = document.createElement('div');
      item.className = 'metric';
      item.innerHTML = `<div class="metric-label">${key}:</div><div class="metric-value">${value}</div>`;
      ogData.appendChild(item);
    }
  }
  
  const twitterData = document.getElementById('twitter-data');
  twitterData.innerHTML = '';
  
  if (Object.keys(data.twitterData).length === 0) {
    twitterData.innerHTML = '<div class="missing">No Twitter Card tags found</div>';
  } else {
    for (const [key, value] of Object.entries(data.twitterData)) {
      const item = document.createElement('div');
      item.className = 'metric';
      item.innerHTML = `<div class="metric-label">${key}:</div><div class="metric-value">${value}</div>`;
      twitterData.appendChild(item);
    }
  }
}

function copyHeadings() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.scripting.executeScript({
      target: {tabId: tabs[0].id},
      function: function() {
        let headingsText = '';
        for (let i = 1; i <= 6; i++) {
          const headings = document.querySelectorAll('h' + i);
          if (headings.length > 0) {
            headingsText += `H${i} (${headings.length}):\n`;
            Array.from(headings).forEach(h => {
              headingsText += `- ${h.innerText.trim()}\n`;
            });
            headingsText += '\n';
          }
        }
        return headingsText;
      }
    }, function(results) {
      if (results && results[0] && results[0].result) {
        navigator.clipboard.writeText(results[0].result)
          .then(() => {
            alert('Headings copied to clipboard!');
          })
          .catch(err => {
            console.error('Could not copy text: ', err);
          });
      }
    });
  });
}

function exportLinks() {
  // If we have the links data in memory, use it with current filters
  if (window.linksData) {
    // Get filter states
    const hideDuplicates = document.getElementById('hide-duplicates').checked;
    const hideInternal = document.getElementById('hide-internal').checked;
    
    let links = [...window.linksData.items];
    
    // Apply filters
    if (hideInternal) {
      links = links.filter(link => !link.isInternal);
    }
    
    // Handle duplicates
    if (hideDuplicates) {
      const uniqueUrls = new Set();
      links = links.filter(link => {
        if (uniqueUrls.has(link.url)) {
          return false;
        }
        uniqueUrls.add(link.url);
        return true;
      });
    }
    
    // Create CSV with filtered links
    let csv = 'Type,Anchor,URL\n';
    links.forEach(link => {
      const anchor = link.anchor.replace(/,/g, ' ') || 'No anchor text';
      csv += `${link.isInternal ? 'Internal' : 'External'},"${anchor}","${link.url}"\n`;
    });
    
    // Download the CSV
    const blob = new Blob([csv], {type: 'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'links_export.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }
  
  // Fallback to original method if we don't have the data in memory
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.scripting.executeScript({
      target: {tabId: tabs[0].id},
      function: function() {
        const allLinks = document.querySelectorAll('a');
        const currentDomain = window.location.hostname;
        let csv = 'Type,Anchor,URL\n';
        
        allLinks.forEach(link => {
          const href = link.href || '';
          const anchor = link.innerText.trim().replace(/,/g, ' ') || 'No anchor text';
          const isInternal = href.includes(currentDomain) || href.startsWith('/');
          
          csv += `${isInternal ? 'Internal' : 'External'},"${anchor}","${href}"\n`;
        });
        
        return csv;
      }
    }, function(results) {
      if (results && results[0] && results[0].result) {
        const blob = new Blob([results[0].result], {type: 'text/csv'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'links_export.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    });
  });
}

function filterLinks() {
  if (!window.linksData) return;
  
  const linksList = document.getElementById('links-list');
  linksList.innerHTML = '';
  
  // Get filter states
  const hideDuplicates = document.getElementById('hide-duplicates').checked;
  const hideInternal = document.getElementById('hide-internal').checked;
  const groupDomains = document.getElementById('group-domains').checked;
  const showFullList = document.getElementById('show-full-list').checked;
  
  let links = [...window.linksData.items];
  
  // Apply filters
  if (hideInternal) {
    links = links.filter(link => !link.isInternal);
  }
  
  // Handle duplicates
  if (hideDuplicates) {
    const uniqueUrls = new Set();
    links = links.filter(link => {
      if (uniqueUrls.has(link.url)) {
        return false;
      }
      uniqueUrls.add(link.url);
      return true;
    });
  }
  
  // Group by domain if needed
  if (groupDomains) {
    const domainGroups = {};
    
    links.forEach(link => {
      try {
        const url = new URL(link.url);
        const domain = url.hostname;
        
        if (!domainGroups[domain]) {
          domainGroups[domain] = [];
        }
        
        domainGroups[domain].push(link);
      } catch (e) {
        // Handle invalid URLs
        if (!domainGroups['Other']) {
          domainGroups['Other'] = [];
        }
        domainGroups['Other'].push(link);
      }
    });
    
    // Display grouped links
    for (const [domain, domainLinks] of Object.entries(domainGroups)) {
      const domainHeader = document.createElement('div');
      domainHeader.className = 'section-title';
      domainHeader.style.fontSize = '14px';
      domainHeader.style.marginTop = '10px';
      domainHeader.style.marginBottom = '5px';
      domainHeader.innerHTML = `<span>${domain} (${domainLinks.length})</span>`;
      linksList.appendChild(domainHeader);
      
      if (showFullList) {
        domainLinks.forEach(link => {
          const linkItem = document.createElement('div');
          linkItem.className = 'link-item';
          linkItem.innerHTML = `<div><strong>${link.isInternal ? 'Internal' : 'External'}:</strong> ${link.anchor}</div>
                               <div>${link.url}</div>`;
          linksList.appendChild(linkItem);
        });
      }
    }
  } else if (showFullList) {
    // Display flat list
    links.forEach(link => {
      const linkItem = document.createElement('div');
      linkItem.className = 'link-item';
      linkItem.innerHTML = `<div><strong>${link.isInternal ? 'Internal' : 'External'}:</strong> ${link.anchor}</div>
                           <div>${link.url}</div>`;
      linksList.appendChild(linkItem);
    });
  }
  
  // Show count of filtered links
  const filteredCount = document.createElement('div');
  filteredCount.style.marginBottom = '10px';
  filteredCount.style.fontSize = '13px';
  filteredCount.style.fontStyle = 'italic';
  filteredCount.textContent = `Showing ${links.length} links${hideDuplicates ? ' (duplicates hidden)' : ''}${hideInternal ? ' (internal links hidden)' : ''}`;
  linksList.insertBefore(filteredCount, linksList.firstChild);
}
