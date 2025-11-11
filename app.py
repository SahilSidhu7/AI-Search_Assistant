import sys
from urllib.request import urlopen, Request
from bs4 import BeautifulSoup
from googleapiclient.discovery import build
import json

from flask import Flask, request, jsonify, render_template
from flask_cors import CORS

import google.generativeai as genai

# --- 1. SET UP YOUR API CREDENTIALS ---
MY_API_KEY = "AIzaSyCrtfm-i5bpLbEKsSwfEz5sDL156YMQhgs" 
MY_SEARCH_ENGINE_ID = "a422e7de3fcf2462c"

# --- 2. SET UP HEADERS FOR FETCHING THE PAGE ---
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36'}

# --- 3. SET UP GEMINI AI MODEL ---
# Configure Gemini API
genai.configure(api_key=MY_API_KEY)

# Specify the Gemini model to use
# Common model names: "gemini-pro", "gemini-1.5-pro", "gemini-1.5-flash-latest"
GEMINI_MODEL_NAME = "gemini-2.5-flash"  # Using stable gemini-pro model


# --- Helper Functions ---
def generate_search_queries(user_query):
    """
    Uses Gemini to generate 3-4 optimized search queries from the user's question.
    """
    print(f"--- Generating optimized search queries for: '{user_query}' ---")
    try:
        model = genai.GenerativeModel(GEMINI_MODEL_NAME)
        
        prompt = f"""Given the following user question or problem, generate exactly 3-4 optimized search queries that would help find the best information to answer it comprehensively.

User question: {user_query}

Generate exactly 3-4 search queries. Each query should be on a separate line. Make them specific, diverse, and complementary to cover different aspects of the question.
IMPORTANT: Return ONLY the queries, one per line, with no numbering, bullets, or additional text. Just the queries themselves."""

        response = model.generate_content(
            prompt,
            generation_config={
                "temperature": 0.8,
                "max_output_tokens": 300,
            }
        )
        
        # Parse the response more carefully
        raw_text = response.text.strip()
        # Remove common prefixes and clean up
        lines = raw_text.split('\n')
        queries = []
        for line in lines:
            line = line.strip()
            # Remove numbering (1., 2., etc.), bullets (-, *, •), and other prefixes
            line = line.lstrip('0123456789.-*•) ')
            if line and len(line) > 5:  # Filter out very short lines
                queries.append(line)
        
        # Ensure we have at least 3 queries, if not, split the original query
        if len(queries) < 2:
            print(f"Warning: Only generated {len(queries)} queries, creating variations...")
            # Create variations of the original query
            # Ensure user_query is a string
            query_str = str(user_query) if not isinstance(user_query, str) else user_query
            base_queries = [
                query_str,
                f"{query_str} explained",
                f"{query_str} guide",
                f"how to {query_str.lower()}"
            ]
            queries = base_queries[:4]
        
        # Limit to 4 queries max
        queries = queries[:4]
        
        print(f"--- Generated {len(queries)} search queries ---")
        for i, q in enumerate(queries, 1):
            print(f"  {i}. {q}")
        
        return queries
    
    except Exception as e:
        print(f"Error generating search queries: {e}")
        # Fallback: create query variations
        print("Creating query variations as fallback...")
        # Ensure user_query is a string
        query_str = str(user_query) if not isinstance(user_query, str) else user_query
        base_queries = [
            query_str,
            f"{query_str} explained",
            f"{query_str} guide tutorial",
            f"what is {query_str.lower()}"
        ]
        return base_queries[:4]

def search_google_api(query, api_key, cx_id, num_results=1):
    """
    Searches Google API and returns results.
    """
    print(f"--- Searching Google API for: '{query}' ---")
    try:
        service = build("customsearch", "v1", developerKey=api_key)
        response = service.cse().list(q=query, cx=cx_id, num=num_results).execute()
        
        results = []
        if 'items' in response and len(response['items']) > 0:
            for item in response['items']:
                results.append({
                    'link': item['link'],
                    'title': item['title'],
                    'snippet': item.get('snippet', '')
                })
                print(f"--- Found: {item['title']} ---")
            return results
        else:
            return []
    except Exception as e:
        print(f"An error occurred with the Google API: {e}")
        return []

def fetch_page_content(url):
    """
    Fetches and extracts text content from a URL.
    Returns the content or error message.
    """
    if not url:
        return None
    print(f"--- Fetching content from {url} ---")
    try:
        req_page = Request(url, headers=HEADERS)
        html_page = urlopen(req_page, timeout=10)
        soup_page = BeautifulSoup(html_page, 'lxml')
        
        main_content = soup_page.find('main')
        if not main_content: 
            main_content = soup_page.find('article')
        
        if main_content:
            page_text = main_content.get_text(separator=' ', strip=True)
        else:
            page_text = soup_page.body.get_text(separator=' ', strip=True) if soup_page.body else ""
        
        # Limit to 8000 chars per page to allow for multiple pages
        return page_text[:8000]
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return None

def synthesize_answer(user_query, all_content, previous_context=None):
    """
    Uses Gemini to synthesize a comprehensive answer from all scraped content.
    If previous_context is provided, it's a follow-up question.
    """
    print(f"--- Synthesizing comprehensive answer from {len(all_content)} sources ---")
    try:
        model = genai.GenerativeModel(GEMINI_MODEL_NAME)
        
        # Combine all content with source information
        combined_content = "\n\n".join([
            f"Source {i+1} ({item['title']}):\n{item['content']}"
            for i, item in enumerate(all_content)
        ])
        
        # Build prompt with or without context
        if previous_context:
            context_info = f"""
Previous Question: {previous_context.get('query', 'N/A')}
Previous Answer Summary: {previous_context.get('summary', '')[:500]}...

Current Follow-up Question: {user_query}
"""
            prompt = f"""This is a follow-up question to a previous conversation. Please provide a comprehensive answer that:
1. References the previous context when relevant
2. Builds upon or clarifies the previous answer
3. Addresses the new specific question asked

{context_info}

New Information from sources:
{combined_content}

Please provide a detailed, accurate, and well-organized answer that:
- References the previous context when it's relevant to the follow-up question
- Synthesizes the new information from all sources
- Directly addresses the follow-up question
- Uses markdown formatting for better readability (bold, lists, headings, paragraphs)

If there are conflicting viewpoints, mention them. Cite key points when relevant."""
        else:
            prompt = f"""Based on the following information gathered from multiple web sources, provide a comprehensive and well-structured answer to the user's question.

User's Question: {user_query}

Information from sources:
{combined_content}

Please provide a detailed, accurate, and well-organized answer that synthesizes the information from all sources. Use markdown formatting for better readability:
- Use **bold** for important terms
- Use bullet points or numbered lists for key points
- Use headings (##) for main sections if needed
- Use proper paragraphs for readability

If there are conflicting viewpoints, mention them. Cite key points when relevant. Make sure the answer directly addresses the user's question."""

        response = model.generate_content(
            prompt,
            generation_config={
                "temperature": 0.7,
                "top_p": 0.9,
                "top_k": 40,
                "max_output_tokens": 4096,
            }
        )
        
        answer = response.text
        print("--- Comprehensive answer generated! ---")
        return answer
    
    except Exception as e:
        print(f"Error synthesizing answer: {e}")
        return f"Error: Could not generate comprehensive answer. {str(e)}"

# --- 4. FLASK APP SETUP ---
app = Flask(__name__)
CORS(app) 

@app.route('/')
def home():
    return "Your Flask server is running! Open your index.html file in your browser."

# --- 5. ENHANCED SEARCH ROUTE (MULTI-QUERY WORKFLOW) ---
@app.route('/search', methods=['POST'])
def search():
    if MY_API_KEY == "YOUR_API_KEY_HERE":
        return jsonify({'error': "API key is not set on the server."}), 500

    data = request.json
    user_query = data.get('query')
    is_followup = data.get('followup', False)
    previous_context = data.get('previous_context', {})
    
    if not user_query:
        return jsonify({'error': 'No query provided.'}), 400
    
    # Ensure user_query is a string (not a dict or other type)
    if not isinstance(user_query, str):
        user_query = str(user_query)
    
    try:
        # Step 1: Generate optimized search queries using Gemini
        # If it's a follow-up, include context in the query generation
        if is_followup and previous_context:
            # Enhance the query with context
            prev_query = previous_context.get('query', '')
            if not isinstance(prev_query, str):
                prev_query = str(prev_query)
            context_query = f"{user_query} (in context of: {prev_query})"
            search_queries = generate_search_queries(context_query)
        else:
            search_queries = generate_search_queries(user_query)
        
        # Step 2: Search Google for each query and collect results
        all_search_results = []
        seen_urls = set()  # Avoid duplicate URLs
        
        for query in search_queries:
            results = search_google_api(query, MY_API_KEY, MY_SEARCH_ENGINE_ID, num_results=2)
            for result in results:
                if result['link'] not in seen_urls:
                    all_search_results.append(result)
                    seen_urls.add(result['link'])
        
        if not all_search_results:
            return jsonify({
                'title': "No Results Found",
                'link': None,
                'snippet': "Could not find any results for your query.",
                'summary': "No search results were found. Please try rephrasing your question.",
                'sources': []
            })
        
        # Step 3: Scrape content from all unique URLs
        all_content = []
        for result in all_search_results[:8]:  # Limit to 8 sources max
            content = fetch_page_content(result['link'])
            if content:
                all_content.append({
                    'title': result['title'],
                    'link': result['link'],
                    'snippet': result['snippet'],
                    'content': content
                })
        
        if not all_content:
            return jsonify({
                'title': all_search_results[0]['title'],
                'link': all_search_results[0]['link'],
                'snippet': all_search_results[0]['snippet'],
                'summary': "Could not fetch content from the search results.",
                'sources': [{'title': r['title'], 'link': r['link']} for r in all_search_results[:5]]
            })
        
        # Step 4: Synthesize comprehensive answer from all scraped content
        # Pass previous context if it's a follow-up
        comprehensive_answer = synthesize_answer(
            user_query, 
            all_content, 
            previous_context if is_followup else None
        )
        
        # Step 5: Prepare response with sources
        sources = [{'title': item['title'], 'link': item['link'], 'snippet': item['snippet']} 
                   for item in all_content]
        
        return jsonify({
            'title': all_content[0]['title'] if all_content else "Search Results",
            'link': all_content[0]['link'] if all_content else None,
            'snippet': all_content[0]['snippet'] if all_content else "",
            'summary': comprehensive_answer.strip(),
            'sources': sources,
            'queries_used': search_queries
        })
    
    except Exception as e:
        print(f"Error in search route: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'error': f'An error occurred: {str(e)}',
            'title': "Error",
            'link': None,
            'snippet': "",
            'summary': f"Error processing your request: {str(e)}",
            'sources': []
        }), 500

# --- 6. RUN THE APP ---
if __name__ == '__main__':
    print("Flask server starting...")
    print("Open your 'index.html' file in a web browser to use the dashboard.")
    app.run(debug=True, port=5000)