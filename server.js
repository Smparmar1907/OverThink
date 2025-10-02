import express from 'express';
import http from 'http';
import cors from 'cors';
import morgan from 'morgan';
import bodyParser from 'body-parser';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(morgan('dev'));
app.use(bodyParser.json({ limit: '1mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// WebSocket setup
const wss = new WebSocketServer({ server });

function broadcast(data) {
  const json = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(json);
    }
  }
}

// Health
app.get('/health', (_, res) => res.json({ ok: true }));

// CS2 GSI endpoint
// CS2 will POST JSON to this endpoint when configured via Game State Integration.
app.post('/gsi', (req, res) => {
  const payload = req.body || {};
  // Keep only relevant fields and add server timestamp
  const simplified = simplifyGsiPayload(payload);
  broadcast({ type: 'gsi', payload: simplified });
  res.json({ ok: true });
});

// Simple reducer to a stable shape for the UI
function simplifyGsiPayload(payload) {
  try {
    const map = payload?.map ? {
      name: payload.map?.name ?? null,
      mode: payload.map?.mode ?? null,
      round: payload.map?.round ?? null,
      team_ct: {
        score: payload.map?.team_ct?.score ?? null,
        name: payload.map?.team_ct?.name ?? 'CT'
      },
      team_t: {
        score: payload.map?.team_t?.score ?? null,
        name: payload.map?.team_t?.name ?? 'T'
      }
    } : null;

    const round = payload?.round ? {
      phase: payload.round?.phase ?? null,
      win_team: payload.round?.win_team ?? null,
      bomb: payload.round?.bomb ?? null
    } : null;

    const player = payload?.player ? {
      name: payload.player?.name ?? null,
      team: payload.player?.team ?? null,
      activity: payload.player?.activity ?? null,
      state: payload.player?.state ? {
        health: payload.player.state?.health ?? null,
        armor: payload.player.state?.armor ?? null,
        helmet: payload.player.state?.helmet ?? false,
        flashed: payload.player.state?.flashed ?? 0,
        smoked: payload.player.state?.smoked ?? 0,
        burning: payload.player.state?.burning ?? 0,
        money: payload.player.state?.money ?? 0,
        round_kills: payload.player.state?.round_kills ?? 0,
        round_killhs: payload.player.state?.round_killhs ?? 0
      } : null,
      weapons: payload.player?.weapons ? simplifyWeapons(payload.player.weapons) : []
    } : null;

    const allplayers = payload?.allplayers ? simplifyAllPlayers(payload.allplayers) : [];

    return { map, round, player, allplayers, provider: payload?.provider ?? null, phase_countdowns: payload?.phase_countdowns ?? null, auth: Boolean(payload?.auth) };
  } catch (err) {
    return { error: 'simplify-failed' };
  }
}

function simplifyWeapons(weapons) {
  const simplified = [];
  try {
    for (const key of Object.keys(weapons)) {
      const w = weapons[key];
      simplified.push({
        name: w?.name ?? key,
        type: w?.type ?? null,
        state: w?.state ?? null,
        ammo_clip: w?.ammo_clip ?? null,
        ammo_reserve: w?.ammo_reserve ?? null
      });
    }
  } catch {}
  return simplified;
}

function simplifyAllPlayers(allplayers) {
  const simplified = [];
  try {
    for (const steamId of Object.keys(allplayers)) {
      const p = allplayers[steamId];
      simplified.push({
        steamId,
        name: p?.name ?? null,
        team: p?.team ?? null,
        observer_slot: p?.observer_slot ?? null,
        state: {
          health: p?.state?.health ?? null,
          armor: p?.state?.armor ?? null,
          helmet: p?.state?.helmet ?? false,
          money: p?.state?.money ?? 0,
          kills: p?.state?.kills ?? 0,
          deaths: p?.state?.deaths ?? 0,
          round_kills: p?.state?.round_kills ?? 0,
        }
      });
    }
  } catch {}
  return simplified;
}

// SPA fallback (optional)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
