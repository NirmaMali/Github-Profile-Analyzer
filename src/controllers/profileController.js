const { pool } = require('../config/db');
const { fetchUserProfile, fetchUserRepos, computeRepoInsights } = require('../services/githubService');

const USERNAME_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const SINGLE_CHAR_REGEX = /^[a-zA-Z0-9]$/;
const ACTIVITY_SCORE_SQL = `LEAST(100, ROUND(
  (LEAST(COALESCE(p.followers, 0), 100) * 0.3) +
  (LEAST(COALESCE(ri.total_stars, 0), 100) * 0.4) +
  (LEAST(COALESCE(p.public_repos, 0), 50) * 0.3)
))`;

function isValidUsername(username) {
  return SINGLE_CHAR_REGEX.test(username) || USERNAME_REGEX.test(username);
}

function parseLanguageBreakdown(row) {
  if (row && row.language_breakdown && typeof row.language_breakdown === 'string') {
    row.language_breakdown = JSON.parse(row.language_breakdown);
  }
  return row;
}

function computeActivityScore(row) {
  const capFollowers = Math.min(row.followers || 0, 100);
  const capStars = Math.min(row.total_stars || 0, 100);
  const capRepos = Math.min(row.public_repos || 0, 50);
  return Math.min(100, Math.round((capFollowers * 0.3) + (capStars * 0.4) + (capRepos * 0.3)));
}

function normalizeProfileRow(row) {
  if (!row) {
    return null;
  }

  parseLanguageBreakdown(row);
  return {
    ...row,
    activity_score: computeActivityScore(row)
  };
}

async function getLatestProfileSnapshot(username) {
  const [rows] = await pool.query(
    `SELECT p.*, ri.total_stars, ri.total_forks, ri.total_watchers, ri.top_language,
            ri.language_breakdown, ri.most_starred_repo, ri.most_starred_repo_url,
            ri.most_starred_repo_stars, ri.avg_repo_size_kb, ri.has_readme_profile,
            ri.analyzed_at AS analyzed_at
     FROM profiles p
     LEFT JOIN repo_insights ri ON p.id = ri.profile_id
     WHERE p.username = ?
     ORDER BY ri.analyzed_at DESC
     LIMIT 1`,
    [username]
  );

  return rows.length > 0 ? normalizeProfileRow(rows[0]) : null;
}

function hasImportedGitHubPayload(body) {
  return !!(body && typeof body === 'object' && body.profile && Array.isArray(body.repos));
}

function validateImportedGitHubPayload(username, profile, repos) {
  if (!profile || typeof profile !== 'object' || typeof profile.login !== 'string') {
    return 'Imported profile data is missing a valid login';
  }

  if (!Array.isArray(repos)) {
    return 'Imported repository data must be an array';
  }

  if (profile.login.toLowerCase() !== username.toLowerCase()) {
    return 'Imported profile login does not match the requested username';
  }

  return null;
}

async function persistProfileAnalysis(githubUser, insights) {
  const normalizedUsername = githubUser.login;

  await pool.query(
    `INSERT INTO profiles (username, name, bio, avatar_url, location, company, blog, email,
                           public_repos, public_gists, followers, following, account_type, github_created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name=VALUES(name), bio=VALUES(bio), avatar_url=VALUES(avatar_url),
       location=VALUES(location), company=VALUES(company), blog=VALUES(blog),
       email=VALUES(email), public_repos=VALUES(public_repos), public_gists=VALUES(public_gists),
       followers=VALUES(followers), following=VALUES(following), account_type=VALUES(account_type),
       github_created_at=VALUES(github_created_at)`,
    [
      normalizedUsername,
      githubUser.name || null,
      githubUser.bio || null,
      githubUser.avatar_url || null,
      githubUser.location || null,
      githubUser.company || null,
      githubUser.blog || null,
      githubUser.email || null,
      githubUser.public_repos || 0,
      githubUser.public_gists || 0,
      githubUser.followers || 0,
      githubUser.following || 0,
      githubUser.type || 'User',
      githubUser.created_at ? new Date(githubUser.created_at) : null
    ]
  );

  const [profileRows] = await pool.query(
    'SELECT id FROM profiles WHERE username = ?',
    [normalizedUsername]
  );
  const profileId = profileRows[0].id;

  await pool.query(
    `INSERT INTO repo_insights (profile_id, total_stars, total_forks, total_watchers, top_language,
                                language_breakdown, most_starred_repo, most_starred_repo_url,
                                most_starred_repo_stars, avg_repo_size_kb, has_readme_profile)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      profileId,
      insights.total_stars,
      insights.total_forks,
      insights.total_watchers,
      insights.top_language,
      JSON.stringify(insights.language_breakdown),
      insights.most_starred_repo,
      insights.most_starred_repo_url,
      insights.most_starred_repo_stars,
      insights.avg_repo_size_kb,
      insights.has_readme_profile
    ]
  );

  return getLatestProfileSnapshot(normalizedUsername);
}

async function analyzeProfile(req, res, next) {
  try {
    const { username } = req.params;

    if (!isValidUsername(username)) {
      return res.status(400).json({ success: false, error: 'Invalid GitHub username format' });
    }

    const force = req.query.force === 'true';

    if (!force) {
      const [cachedRows] = await pool.query(
        `SELECT p.*, ri.total_stars, ri.total_forks, ri.total_watchers, ri.top_language,
                ri.language_breakdown, ri.most_starred_repo, ri.most_starred_repo_url,
                ri.most_starred_repo_stars, ri.avg_repo_size_kb, ri.has_readme_profile,
                ri.analyzed_at
         FROM profiles p
         LEFT JOIN repo_insights ri ON p.id = ri.profile_id
         WHERE p.username = ?
         ORDER BY ri.analyzed_at DESC
         LIMIT 1`,
        [username]
      );

      if (cachedRows.length > 0) {
        const row = cachedRows[0];
        const lastAnalyzed = new Date(row.last_analyzed_at);
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

        if (lastAnalyzed > oneHourAgo) {
          return res.status(200).json({ success: true, data: normalizeProfileRow(row), cached: true });
        }
      }
    }

    let githubUser, repos, insights;
    if (hasImportedGitHubPayload(req.body)) {
      const payloadError = validateImportedGitHubPayload(username, req.body.profile, req.body.repos);
      if (payloadError) {
        return res.status(400).json({ success: false, error: payloadError });
      }

      githubUser = req.body.profile;
      repos = req.body.repos;
      insights = computeRepoInsights(repos, username);
    } else {
      try {
        githubUser = await fetchUserProfile(username);
        repos = await fetchUserRepos(username);
        insights = computeRepoInsights(repos, username);
      } catch (err) {
        if (err.message === 'GITHUB_USER_NOT_FOUND') {
          return res.status(404).json({ success: false, error: 'GitHub user not found' });
        }
        if (err.message === 'GITHUB_RATE_LIMITED') {
          return res.status(429).json({ success: false, error: 'GitHub rate limit exceeded. Add GITHUB_TOKEN to .env' });
        }
        if (err.message === 'GITHUB_NETWORK_ERROR') {
          return res.status(503).json({ success: false, error: 'Could not reach the GitHub API. Check your network and try again.' });
        }
        if (err.message.startsWith('GITHUB_API_ERROR:')) {
          return res.status(502).json({ success: false, error: 'GitHub API returned an unexpected response' });
        }
        return next(err);
      }
    }

    const savedProfile = await persistProfileAnalysis(githubUser, insights);

    return res.status(200).json({
      success: true,
      data: savedProfile,
      cached: false
    });
  } catch (err) {
    return next(err);
  }
}

async function getAllProfiles(req, res, next) {
  try {
    let page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 10;
    if (limit > 50) limit = 50;
    const sort = req.query.sort;
    const order = req.query.order;
    const search = req.query.search;
    const safeOrder = (order === 'asc' || order === 'desc') ? order : 'desc';

    const sortMap = {
      analyzed_at: 'COALESCE(ri.analyzed_at, p.last_analyzed_at)',
      followers: 'p.followers',
      public_repos: 'p.public_repos',
      total_stars: 'COALESCE(ri.total_stars, 0)',
      activity_score: ACTIVITY_SCORE_SQL
    };
    const safeSort = sortMap[sort] ? sort : 'analyzed_at';

    let baseQuery = `SELECT p.*, ri.total_stars, ri.total_forks, ri.top_language,
                            ri.most_starred_repo, ri.most_starred_repo_stars,
                            ri.analyzed_at AS analyzed_at,
                            ${ACTIVITY_SCORE_SQL} AS activity_score
                     FROM profiles p
                     LEFT JOIN (
                       SELECT ri1.* FROM repo_insights ri1
                       WHERE ri1.analyzed_at = (
                         SELECT MAX(ri2.analyzed_at) FROM repo_insights ri2 WHERE ri2.profile_id = ri1.profile_id
                       )
                     ) ri ON p.id = ri.profile_id`;

    let countQuery = 'SELECT COUNT(*) as total FROM profiles p';
    const queryParams = [];
    const countParams = [];

    if (search) {
      baseQuery += ' WHERE p.username LIKE ?';
      countQuery += ' WHERE p.username LIKE ?';
      const searchPattern = '%' + search + '%';
      queryParams.push(searchPattern);
      countParams.push(searchPattern);
    }

    const sortCol = sortMap[safeSort];
    baseQuery += ` ORDER BY ${sortCol} ${safeOrder}`;

    const offset = (page - 1) * limit;
    baseQuery += ' LIMIT ? OFFSET ?';
    queryParams.push(limit, offset);

    const [rows] = await pool.query(baseQuery, queryParams);
    const [countRows] = await pool.query(countQuery, countParams);
    const total = countRows[0].total;

    return res.status(200).json({
      success: true,
      data: rows.map(normalizeProfileRow),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    return next(err);
  }
}

async function getProfileByUsername(req, res, next) {
  try {
    const { username } = req.params;
    const profile = await getLatestProfileSnapshot(username);

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found. Analyze it first via POST /api/profiles/analyze/:username'
      });
    }

    return res.status(200).json({
      success: true,
      data: profile
    });
  } catch (err) {
    return next(err);
  }
}

async function deleteProfile(req, res, next) {
  try {
    const { username } = req.params;

    if (!isValidUsername(username)) {
      return res.status(400).json({ success: false, error: 'Invalid GitHub username format' });
    }

    const [result] = await pool.query(
      'DELETE FROM profiles WHERE username = ?',
      [username]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    return res.status(200).json({ success: true, message: 'Profile deleted successfully' });
  } catch (err) {
    return next(err);
  }
}

async function compareProfiles(req, res, next) {
  try {
    const users = req.query.users
      ? req.query.users.split(',').map(u => u.trim()).filter(Boolean)
      : [];

    if (users.length < 2 || users.length > 4) {
      return res.status(400).json({ success: false, error: 'Provide 2 to 4 usernames' });
    }

    const results = [];
    const missing = [];

    for (const username of users) {
      const row = await getLatestProfileSnapshot(username);

      if (!row) {
        missing.push(username);
      } else {
        results.push({
          username: row.username,
          name: row.name,
          avatar_url: row.avatar_url,
          followers: row.followers,
          public_repos: row.public_repos,
          total_stars: row.total_stars,
          total_forks: row.total_forks,
          top_language: row.top_language,
          activity_score: row.activity_score
        });
      }
    }

    if (missing.length > 0) {
      return res.status(404).json({
        success: false,
        error: 'Profiles not found: ' + missing.join(', '),
        hint: 'Analyze them first'
      });
    }

    return res.status(200).json({ success: true, data: results });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  analyzeProfile,
  getAllProfiles,
  getProfileByUsername,
  deleteProfile,
  compareProfiles
};
