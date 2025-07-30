# Brave Search Integration Setup Guide

This guide explains how to configure Brave Search API access for the MCP server to perform web and news searches.

## 🔧 Prerequisites

1. **Brave Search API Access**: Sign up for Brave Search API
2. **API Key**: Obtain your API subscription token
3. **MCP Server**: Running MCP server with OAuth authentication

## 📋 Step-by-Step Setup

### Step 1: Brave Search API Registration

1. **Visit Brave Search API**
   - Go to: https://api.search.brave.com/
   - Sign up for an account or log in

2. **Choose Subscription Plan**
   - **Free Tier**: 2,000 queries per month
   - **Pro Tier**: Starting from $3/month for 20,000 queries
   - **Enterprise**: Custom pricing for high-volume usage

3. **Get API Key**
   - After registration, navigate to your dashboard
   - Copy your **Subscription Token** (API Key)
   - This will be used as `BRAVE_SEARCH_API_KEY`

### Step 2: Environment Configuration

1. **Development Environment**
   Create or update `.dev.vars`:
   ```bash
   BRAVE_SEARCH_API_KEY=your_brave_search_api_key_here
   BRAVE_SEARCH_API_URL=https://api.search.brave.com/res/v1
   BRAVE_SEARCH_DEFAULT_COUNTRY=US
   BRAVE_SEARCH_DEFAULT_LANGUAGE=en
   ```

2. **Production Environment**
   Set secrets using Wrangler:
   ```bash
   wrangler secret put BRAVE_SEARCH_API_KEY
   # Enter your API key when prompted
   ```

### Step 3: Testing the Integration

1. **Start Development Server**
   ```bash
   npm run dev
   ```

2. **Access via OAuth**
   - Complete OAuth authentication flow
   - The Brave Search tools will be available after authentication

3. **Test Search Tools**
   Once authenticated, you can use these MCP tools:
   
   **Web Search:**
   ```json
   {
     "tool": "webSearch",
     "arguments": {
       "query": "artificial intelligence news",
       "count": 10,
       "country": "US",
       "language": "en",
       "safesearch": "moderate",
       "freshness": "pw",
       "result_filter": "web"
     }
   }
   ```
   
   **News Search:**
   ```json
   {
     "tool": "newsSearch",
     "arguments": {
       "query": "technology trends 2024",
       "count": 15,
       "country": "US",
       "freshness": "pd"
     }
   }
   ```

## 🛡️ Security Features

### Query Validation
- **Length Limits**: 2-400 characters
- **Content Filtering**: Blocks malicious patterns and protocols
- **Harmful Content Detection**: Identifies potentially dangerous queries
- **Sanitization**: Removes dangerous characters and protocols

### Content Security
- **Safe Search**: Configurable filtering (strict/moderate/off)
- **Result Sanitization**: Cleans URLs and content for safety
- **Protocol Filtering**: Blocks dangerous protocols (file://, ftp://, etc.)
- **Internal IP Blocking**: Prevents access to localhost/internal networks

### Rate Limiting Awareness
- **Web Search**: 30 queries per minute
- **News Search**: 20 queries per minute
- **Video Search**: 15 queries per minute
- **Built-in throttling** to respect API limits

## 🔧 Available Tools

### 1. **webSearch**
- **Purpose**: General web search with comprehensive filtering
- **Parameters**:
  - `query` (required): Search terms (2-400 chars)
  - `count` (optional): Results count (1-20, default: 10)
  - `country` (optional): Country code (US, GB, DE, etc.)
  - `language` (optional): Language code (en, es, fr, etc.)
  - `safesearch` (optional): strict/moderate/off (default: moderate)
  - `freshness` (optional): pd/pw/pm/py (day/week/month/year)
  - `result_filter` (optional): web/news/videos (default: web)

### 2. **newsSearch**
- **Purpose**: Specialized news article search with recency filtering
- **Parameters**:
  - `query` (required): News search terms (2-400 chars)
  - `count` (optional): Results count (1-20, default: 10)
  - `country` (optional): Country code for localized news
  - `freshness` (optional): pd/pw/pm (day/week/month, default: pw)

## 📊 API Limits & Quotas

### Free Tier Limits
- **Monthly Queries**: 2,000
- **Rate Limit**: 1 query per second
- **Features**: Web search, news search, basic filtering

### Pro Tier Benefits
- **Monthly Queries**: 20,000+ (tiered pricing)
- **Rate Limit**: 10 queries per second
- **Features**: All search types, advanced filtering, priority support

### Enterprise Features
- **Custom Quotas**: Negotiable based on needs
- **Higher Rate Limits**: Up to 100 queries per second
- **Premium Support**: Dedicated support channel
- **SLA**: 99.9% uptime guarantee

## 🔍 Troubleshooting

### Common Issues

**"API key not configured" Error:**
- Verify `BRAVE_SEARCH_API_KEY` is set correctly
- Check environment variable is loaded
- Ensure API key format is correct

**"Invalid API key" Error:**
- Confirm API key is active in Brave dashboard
- Check for typos in API key
- Verify subscription is active

**"Rate limit exceeded" Error:**
- Check your current usage in Brave dashboard
- Implement request throttling in your application
- Consider upgrading to higher tier

**"Query validation failed" Error:**
- Check query length (2-400 characters)
- Remove special characters or protocols
- Review harmful content detection warnings

### Debug Tips

1. **Check API Status**
   - Visit Brave Search API status page
   - Verify your subscription is active

2. **Monitor Usage**
   - Check query count in Brave dashboard
   - Monitor rate limit usage

3. **Test API Directly**
   ```bash
   curl -H "X-Subscription-Token: YOUR_API_KEY" \
        "https://api.search.brave.com/res/v1/web/search?q=test"
   ```

## 🚀 Production Considerations

### Performance Optimization
- **Caching**: Implement result caching for repeated queries
- **Batching**: Group similar queries when possible
- **CDN**: Use CDN for static content in results

### Security Best Practices
- **API Key Security**: Store API key as secret, never in code
- **Query Sanitization**: Always validate and sanitize user input
- **Rate Limiting**: Implement client-side rate limiting
- **Content Filtering**: Enable appropriate safe search levels

### Monitoring & Analytics
- **Usage Tracking**: Monitor API usage and costs
- **Error Monitoring**: Use Sentry for error tracking
- **Performance Metrics**: Track search response times
- **User Analytics**: Monitor search patterns and popular queries

### Cost Management
- **Query Optimization**: Reduce unnecessary API calls
- **Result Caching**: Cache results to reduce API usage
- **Usage Alerts**: Set up billing alerts
- **Tier Planning**: Choose appropriate subscription tier

## 📈 Usage Examples

### Basic Web Search
```bash
# Search for programming tutorials
{
  "query": "JavaScript tutorials 2024",
  "count": 10,
  "safesearch": "moderate"
}
```

### Localized News Search
```bash
# Get recent tech news from Germany
{
  "query": "technology news",
  "count": 15,
  "country": "DE",
  "freshness": "pd"
}
```

### Advanced Web Search
```bash
# Search for recent research papers
{
  "query": "machine learning research papers",
  "count": 20,
  "language": "en",
  "freshness": "pm",
  "safesearch": "off"
}
```

## 🔗 Related Documentation

- [Brave Search API Documentation](https://api.search.brave.com/app/documentation)
- [Brave Search API Status](https://status.search.brave.com/)
- [MCP Protocol Documentation](https://modelcontextprotocol.io/docs)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)

---

This setup enables comprehensive web and news search capabilities with advanced security, content filtering, and performance monitoring through the MCP server.