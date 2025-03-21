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
  document.getElementById('copy-schema').addEventListener('click', copySchema);
  document.getElementById('copy-image-links').addEventListener('click', copyImageLinks);
  document.getElementById('copy-hreflang').addEventListener('click', copyHreflang);
  document.getElementById('export-all').addEventListener('click', exportAllSeoData);
  
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

  // Set up robots.txt and sitemap.xml buttons
  document.getElementById('view-robots').addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const url = new URL(tabs[0].url);
      const robotsUrl = `${url.protocol}//${url.hostname}/robots.txt`;
      chrome.tabs.create({ url: robotsUrl });
    });
  });

  document.getElementById('view-sitemap').addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const url = new URL(tabs[0].url);
      const sitemapUrl = `${url.protocol}//${url.hostname}/sitemap.xml`;
      chrome.tabs.create({ url: sitemapUrl });
    });
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
  
  // Schema.org data extraction
  data.schema = [];
  
  // Method 1: Look for JSON-LD schema
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  jsonLdScripts.forEach(script => {
    try {
      const jsonContent = JSON.parse(script.textContent);
      data.schema.push({
        type: 'JSON-LD',
        data: jsonContent
      });
    } catch (e) {
      // Invalid JSON, skip
    }
  });
  
  // Method 2: Look for microdata
  const itemscopes = document.querySelectorAll('[itemscope]');
  itemscopes.forEach(item => {
    try {
      const itemType = item.getAttribute('itemtype') || 'Unknown Type';
      const properties = {};
      
      const itemprops = item.querySelectorAll('[itemprop]');
      itemprops.forEach(prop => {
        const name = prop.getAttribute('itemprop');
        let value = prop.textContent.trim();
        
        // Check for various ways to extract values
        if (prop.tagName === 'META') {
          value = prop.getAttribute('content') || '';
        } else if (prop.tagName === 'IMG') {
          value = prop.getAttribute('src') || '';
        } else if (prop.tagName === 'A') {
          value = prop.getAttribute('href') || prop.textContent.trim();
        }
        
        properties[name] = value;
      });
      
      data.schema.push({
        type: 'Microdata',
        itemType: itemType,
        data: properties
      });
    } catch (e) {
      // Skip errors
    }
  });
  
  // Method 3: Look for RDFa
  const rdfaElements = document.querySelectorAll('[typeof]');
  rdfaElements.forEach(item => {
    try {
      const itemType = item.getAttribute('typeof') || 'Unknown Type';
      const properties = {};
      
      const props = item.querySelectorAll('[property]');
      props.forEach(prop => {
        const name = prop.getAttribute('property');
        let value = prop.textContent.trim();
        
        // Check for various ways to extract values
        if (prop.tagName === 'META') {
          value = prop.getAttribute('content') || '';
        } else if (prop.tagName === 'IMG') {
          value = prop.getAttribute('src') || '';
        } else if (prop.tagName === 'A') {
          value = prop.getAttribute('href') || prop.textContent.trim();
        }
        
        properties[name] = value;
      });
      
      data.schema.push({
        type: 'RDFa',
        itemType: itemType,
        data: properties
      });
    } catch (e) {
      // Skip errors
    }
  });
  
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
  
  // Add hreflang data collection
  data.hreflang = [];
  const hreflangTags = document.querySelectorAll('link[rel="alternate"][hreflang]');
  hreflangTags.forEach(tag => {
    data.hreflang.push({
      lang: tag.getAttribute('hreflang'),
      href: tag.getAttribute('href')
    });
  });

  // Also check meta tags for hreflang (some sites use meta)
  const metaHreflang = document.querySelectorAll('meta[name="alternate"][hreflang]');
  metaHreflang.forEach(tag => {
    data.hreflang.push({
      lang: tag.getAttribute('hreflang'),
      href: tag.getAttribute('content')
    });
  });
  
  // Add page content collection
  data.content = {
    mainContent: '',
    articleContent: '',
    paragraphs: []
  };

  // Try to get main content from article or main tags
  const article = document.querySelector('article');
  const main = document.querySelector('main');
  
  if (article) {
    data.content.articleContent = article.innerText.trim();
  }
  if (main) {
    data.content.mainContent = main.innerText.trim();
  }

  // Get all paragraphs
  const paragraphs = document.querySelectorAll('p');
  data.content.paragraphs = Array.from(paragraphs).map(p => p.innerText.trim()).filter(text => text.length > 0);
  
  return data;
}

function displayResults(results) {
  if (!results || !results[0] || !results[0].result) return;
  
  const data = results[0].result;
  
  // Store the data globally for the copy function to use
  window.pageData = data;
  
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
  
  // Schema tab
  document.getElementById('schema-count').textContent = data.schema ? data.schema.length : 0;
  
  const schemaList = document.getElementById('schema-list');
  schemaList.innerHTML = '';
  
  if (!data.schema || data.schema.length === 0) {
    schemaList.innerHTML = '<div class="missing">No Schema.org markup found on this page</div>';
  } else {
    // Store schema data globally for copying
    window.schemaData = data.schema;
    
    data.schema.forEach((schema, index) => {
      const schemaItem = document.createElement('div');
      schemaItem.className = 'section';
      schemaItem.style.marginBottom = '15px';
      
      let schemaTypeDisplay = schema.type;
      if (schema.itemType) {
        schemaTypeDisplay += ` - ${schema.itemType.split('/').pop()}`;
      } else if (schema.data && schema.data['@type']) {
        schemaTypeDisplay += ` - ${Array.isArray(schema.data['@type']) ? schema.data['@type'].join(', ') : schema.data['@type']}`;
      }
      
      schemaItem.innerHTML = `<div class="section-title" style="font-size: 14px; margin-bottom: 8px;">${schemaTypeDisplay}</div>`;
      
      const schemaContent = document.createElement('pre');
      schemaContent.style.overflow = 'auto';
      schemaContent.style.fontSize = '12px';
      schemaContent.style.backgroundColor = '#f5f5f7';
      schemaContent.style.padding = '8px';
      schemaContent.style.borderRadius = '4px';
      schemaContent.style.marginTop = '5px';
      schemaContent.style.whiteSpace = 'pre-wrap';
      
      try {
        schemaContent.textContent = JSON.stringify(schema.data, null, 2);
      } catch (e) {
        schemaContent.textContent = 'Error parsing schema data';
      }
      
      schemaItem.appendChild(schemaContent);
      schemaList.appendChild(schemaItem);
    });
  }

  // Hreflang tab
  document.getElementById('hreflang-count').textContent = data.hreflang.length;
  
  const hreflangList = document.getElementById('hreflang-list');
  hreflangList.innerHTML = '';
  
  if (data.hreflang.length === 0) {
    hreflangList.innerHTML = '<div class="missing">No hreflang tags found</div>';
  } else {
    data.hreflang.forEach(tag => {
      const hreflangItem = document.createElement('div');
      hreflangItem.className = 'link-item';
      hreflangItem.innerHTML = `
        <div><strong>Language:</strong> ${tag.lang}</div>
        <div><strong>URL:</strong> ${tag.href}</div>
      `;
      hreflangList.appendChild(hreflangItem);
    });
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

function copySchema() {
  if (!window.schemaData || window.schemaData.length === 0) {
    alert('No schema data available to copy');
    return;
  }
  
  try {
    const schemaJson = JSON.stringify(window.schemaData, null, 2);
    navigator.clipboard.writeText(schemaJson)
      .then(() => {
        alert('Schema data copied to clipboard!');
      })
      .catch(err => {
        console.error('Could not copy text: ', err);
      });
  } catch (e) {
    alert('Error processing schema data: ' + e.message);
  }
}

function copyImageLinks() {
  if (!window.pageData || !window.pageData.images) {
    alert('No image data available to copy');
    return;
  }

  try {
    const images = window.pageData.images.items;
    // Create CSV header
    let imageText = 'Image URL,Alt Text\n';
    
    // Add each image as a CSV row, properly escaping commas and quotes in alt text
    images.forEach(image => {
      const altText = (image.alt || 'Missing').replace(/"/g, '""'); // Escape quotes by doubling them
      imageText += `"${image.src}","${altText}"\n`;
    });

    navigator.clipboard.writeText(imageText)
      .then(() => {
        alert('Image links copied to clipboard in CSV format!');
      })
      .catch(err => {
        console.error('Could not copy text: ', err);
      });
  } catch (e) {
    alert('Error processing image data: ' + e.message);
  }
}

function copyHreflang() {
  if (!window.pageData || !window.pageData.hreflang || window.pageData.hreflang.length === 0) {
    alert('No hreflang data available to copy');
    return;
  }

  try {
    // Create CSV header
    let hreflangText = 'Language,URL\n';
    
    // Add each hreflang as a CSV row
    window.pageData.hreflang.forEach(tag => {
      const lang = tag.lang.replace(/"/g, '""');
      const href = tag.href.replace(/"/g, '""');
      hreflangText += `"${lang}","${href}"\n`;
    });

    navigator.clipboard.writeText(hreflangText)
      .then(() => {
        alert('Hreflang data copied to clipboard in CSV format!');
      })
      .catch(err => {
        console.error('Could not copy text: ', err);
      });
  } catch (e) {
    alert('Error processing hreflang data: ' + e.message);
  }
}

function exportAllSeoData() {
  if (!window.pageData) {
    alert('No page data available to export');
    return;
  }

  try {
    const data = window.pageData;
    let csvContent = '';

    // Get page name from URL for the filename
    const pageUrl = new URL(data.url);
    const pageName = pageUrl.hostname.replace(/[^a-z0-9]/gi, '_');

    // Basic SEO Data
    csvContent += 'PAGE SEO METRICS AND META INFORMATION\n';
    csvContent += 'Metric,Value\n';
    csvContent += `Title,\"${data.title.replace(/"/g, '""')}\"\n`;
    csvContent += `Title Length,${data.title.length}\n`;
    csvContent += `Description,\"${(data.description || '').replace(/"/g, '""')}\"\n`;
    csvContent += `Description Length,${data.description ? data.description.length : 0}\n`;
    csvContent += `URL,\"${data.url}\"\n`;
    csvContent += `Language,\"${data.lang}\"\n`;
    csvContent += `Canonical URL,\"${data.canonical || ''}\"\n`;
    csvContent += `Robots Directive,\"${data.robots || ''}\"\n`;
    csvContent += `Meta Keywords,\"${(data.keywords || '').replace(/"/g, '""')}\"\n`;
    csvContent += `Total Word Count,${data.wordCount}\n\n`;

    // Add content section after meta information and before headings
    csvContent += '\nPAGE CONTENT ANALYSIS\n';
    
    // Main content if found
    if (data.content.mainContent) {
      csvContent += 'MAIN TAG CONTENT\n';
      csvContent += 'Content\n';
      csvContent += `\"${data.content.mainContent.replace(/"/g, '""')}\"\n\n`;
    }

    // Article content if found
    if (data.content.articleContent) {
      csvContent += 'ARTICLE TAG CONTENT\n';
      csvContent += 'Content\n';
      csvContent += `\"${data.content.articleContent.replace(/"/g, '""')}\"\n\n`;
    }

    // Paragraphs
    csvContent += 'PARAGRAPH CONTENT\n';
    csvContent += 'Paragraph Number,Content\n';
    data.content.paragraphs.forEach((paragraph, index) => {
      if (paragraph.trim()) {
        csvContent += `${index + 1},\"${paragraph.replace(/"/g, '""')}\"\n`;
      }
    });
    csvContent += '\n';

    // Headings
    csvContent += 'PAGE HEADING STRUCTURE AND HIERARCHY\n';
    csvContent += 'Heading Type,Total Count,Heading Text\n';
    for (let i = 1; i <= 6; i++) {
      const headings = data.headings[`h${i}`];
      if (headings.count > 0) {
        headings.items.forEach(heading => {
          csvContent += `H${i},${headings.count},\"${heading.replace(/"/g, '""')}\"\n`;
        });
      }
    }
    csvContent += '\n';

    // Links
    csvContent += 'PAGE LINK ANALYSIS AND DISTRIBUTION\n';
    csvContent += 'Link Category,Link Text,Destination URL\n';
    data.links.items.forEach(link => {
      csvContent += `${link.isInternal ? 'Internal' : 'External'},\"${link.anchor.replace(/"/g, '""')}\",\"${link.url}\"\n`;
    });
    csvContent += '\n';

    // Images
    csvContent += 'IMAGE ACCESSIBILITY AND SOURCE ANALYSIS\n';
    csvContent += 'Image Source URL,Alternative Text\n';
    data.images.items.forEach(image => {
      csvContent += `\"${image.src}\",\"${(image.alt || 'Missing Alt Text').replace(/"/g, '""')}\"\n`;
    });
    csvContent += '\n';

    // Open Graph
    csvContent += 'SOCIAL MEDIA - OPEN GRAPH META TAGS\n';
    csvContent += 'OG Property,Content Value\n';
    for (const [key, value] of Object.entries(data.ogData)) {
      csvContent += `\"${key}\",\"${value.replace(/"/g, '""')}\"\n`;
    }
    csvContent += '\n';

    // Twitter Cards
    csvContent += 'SOCIAL MEDIA - TWITTER CARD META TAGS\n';
    csvContent += 'Twitter Property,Content Value\n';
    for (const [key, value] of Object.entries(data.twitterData)) {
      csvContent += `\"${key}\",\"${value.replace(/"/g, '""')}\"\n`;
    }
    csvContent += '\n';

    // Schema
    csvContent += 'STRUCTURED DATA - SCHEMA.ORG MARKUP\n';
    csvContent += 'Schema Type,Schema Data\n';
    data.schema.forEach(schema => {
      csvContent += `\"${schema.type}${schema.itemType ? ' - ' + schema.itemType : ''}\",\"${JSON.stringify(schema.data).replace(/"/g, '""')}\"\n`;
    });
    csvContent += '\n';

    // Hreflang
    csvContent += 'INTERNATIONAL - HREFLANG TAG IMPLEMENTATION\n';
    csvContent += 'Target Language/Region,Localized URL\n';
    data.hreflang.forEach(tag => {
      csvContent += `\"${tag.lang}\",\"${tag.href}\"\n`;
    });

    // Create and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const date = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `seo_analysis_${pageName}_${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

  } catch (e) {
    console.error('Error exporting data:', e);
    alert('Error creating export file: ' + e.message);
  }
}
