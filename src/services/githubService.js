const axios = require('axios');

function mapGitHubError(error) {
  if (error.response) {
    if (error.response.status === 404) {
      return new Error('GITHUB_USER_NOT_FOUND');
    }
    if (error.response.status === 401 || error.response.status === 403 || error.response.status === 429) {
      return new Error('GITHUB_RATE_LIMITED');
    }
    return new Error('GITHUB_API_ERROR:' + error.response.status);
  }

  if (error.request || error.code) {
    return new Error('GITHUB_NETWORK_ERROR');
  }

  return error;
}

function getHeaders(useToken = true) {
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  if (useToken && process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

function shouldRetryWithoutToken(error, usedToken) {
  if (!usedToken || !process.env.GITHUB_TOKEN || !error.response) {
    return false;
  }

  return [401, 403, 429].includes(error.response.status);
}

async function githubGet(url, params) {
  const tokenModes = process.env.GITHUB_TOKEN ? [true, false] : [false];
  let lastError;

  for (const useToken of tokenModes) {
    try {
      const response = await axios.get(url, {
        headers: getHeaders(useToken),
        params
      });
      return response.data;
    } catch (error) {
      lastError = error;

      if (!shouldRetryWithoutToken(error, useToken)) {
        break;
      }
    }
  }

  throw mapGitHubError(lastError);
}

async function fetchUserProfile(username) {
  return githubGet(`https://api.github.com/users/${username}`);
}

async function fetchUserRepos(username) {
  const allRepos = [];
  let page = 1;

  while (page <= 10) {
    try {
      const repos = await githubGet(`https://api.github.com/users/${username}/repos`, {
        per_page: 100,
        page: page,
        sort: 'updated'
      });
      allRepos.push(...repos);

      if (repos.length < 100) {
        break;
      }

      page++;
    } catch (error) {
      throw mapGitHubError(error);
    }
  }

  return allRepos;
}

function computeRepoInsights(repos, username) {
  let total_stars = 0;
  let total_forks = 0;
  let total_watchers = 0;
  const language_breakdown = {};
  let most_starred_repo = null;
  let most_starred_repo_url = null;
  let most_starred_repo_stars = 0;
  let totalSize = 0;

  for (const repo of repos) {
    total_stars += repo.stargazers_count || 0;
    total_forks += repo.forks_count || 0;
    total_watchers += repo.watchers_count || 0;

    if (repo.language) {
      language_breakdown[repo.language] = (language_breakdown[repo.language] || 0) + 1;
    }

    if ((repo.stargazers_count || 0) > most_starred_repo_stars) {
      most_starred_repo_stars = repo.stargazers_count;
      most_starred_repo = repo.name;
      most_starred_repo_url = repo.html_url;
    }

    totalSize += repo.size || 0;
  }

  let top_language = null;
  let maxCount = 0;
  for (const [lang, count] of Object.entries(language_breakdown)) {
    if (count > maxCount) {
      maxCount = count;
      top_language = lang;
    }
  }

  if (repos.length === 0) {
    most_starred_repo = null;
    most_starred_repo_url = null;
    most_starred_repo_stars = 0;
  }

  const avg_repo_size_kb = repos.length > 0
    ? Math.round((totalSize / repos.length) * 100) / 100
    : 0;

  const has_readme_profile = repos.some(
    (repo) => repo.name.toLowerCase() === username.toLowerCase()
  ) ? 1 : 0;

  return {
    total_stars,
    total_forks,
    total_watchers,
    language_breakdown,
    top_language,
    most_starred_repo,
    most_starred_repo_url,
    most_starred_repo_stars,
    avg_repo_size_kb,
    has_readme_profile
  };
}

module.exports = { fetchUserProfile, fetchUserRepos, computeRepoInsights };
