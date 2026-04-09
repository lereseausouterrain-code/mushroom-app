import { supabase } from "./lib/supabase";
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  CloudSun,
  AlertTriangle,
  Package,
  Sprout,
  Scale,
  FlaskConical,
  CalendarClock,
  Plus,
  CheckCircle2,
  RotateCcw,
  Trash2,
} from "lucide-react";

const speciesConfig = {
  "Blue Oyster": { code: "BO", incubationDays: 14 },
  "Lion's Mane": { code: "LM", incubationDays: 20 },
  Chestnut: { code: "CH", incubationDays: 30 },
};

const initialMoves = [];
const initialHarvests = [];
const initialLosses = [];
const STORAGE_KEY = "mushroom-farm-manager-v1";

function loadAppState() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveAppState(state) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage failures
  }
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function diffInDays(from, to = new Date()) {
  const a = new Date(`${from}T12:00:00`);
  const b = new Date(to);
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(dateString) {
  if (!dateString) return "—";
  return new Date(`${dateString}T12:00:00`).toLocaleDateString();
}

function groupByWeek(items) {
  const map = {};
  items.forEach((item) => {
    const date = new Date(`${item.harvestDate}T12:00:00`);
    const first = new Date(date);
    const day = first.getDay();
    const diff = first.getDate() - day + (day === 0 ? -6 : 1);
    first.setDate(diff);
    const key = first.toISOString().slice(0, 10);
    map[key] = (map[key] || 0) + Number(item.pounds || 0);
  });

  return Object.entries(map)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, pounds]) => ({ weekStart, pounds }));
}

function average(arr) {
  if (!arr.length) return 0;
  return arr.reduce((sum, value) => sum + value, 0) / arr.length;
}

function mapSpawnRow(row) {
  return {
    id: row.id,
    species: row.species,
    supplier: row.supplier,
    lotCode: row.lot_code,
    receivedDate: row.received_date,
    bagsReceived: Number(row.bags_received || 0),
    bagsRemaining: Number(row.bags_remaining || 0),
    notes: row.notes ?? "",
    createdAt: row.created_at ?? null,
  };
}

function mapLotRow(row) {
  return {
    id: row.id,
    lotCode: row.lot_code,
    species: row.species,
    inoculationDate: row.inoculation_date,
    expectedReadyDate: row.expected_ready_date,
    blocksCreated: Number(row.blocks_created || 0),
    blocksAvailable: Number(row.blocks_available || 0),
    spawnBagsUsed: Number(row.spawn_bags_used || 0),
    spawnReceiptId: row.spawn_receipt_id,
    status: row.status || "incubating",
    notes: row.notes ?? "",
    createdAt: row.created_at ?? null,
  };
}

function MetricCard({ title, value, subtitle, icon: Icon }) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">{title}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">{value || 0}</p>
            {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          <div className="rounded-2xl bg-slate-100 p-3">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function getEffectiveLotStatus(lot) {
  if (lot.status === "closed" || lot.status === "moved") return lot.status;
  if (!lot.blocksAvailable || Number(lot.blocksAvailable) <= 0) return "closed";

  const today = new Date(`${isoToday()}T12:00:00`);
  const readyDate = new Date(`${lot.expectedReadyDate}T12:00:00`);

  return readyDate <= today ? "ready" : "incubating";
}

export default function MushroomFarmManagerApp() {
  const persisted = useMemo(() => loadAppState(), []);

  const [spawnInventory, setSpawnInventory] = useState([]);
  const [lots, setLots] = useState([]);
  const [moves, setMoves] = useState(() => persisted?.moves ?? initialMoves);
  const [harvests, setHarvests] = useState(() => persisted?.harvests ?? initialHarvests);
  const [losses, setLosses] = useState(() => persisted?.losses ?? initialLosses);

  const [weather, setWeather] = useState({
    loading: true,
    location: "Sherbrooke, Quebec",
    currentTemp: null,
    minTemp: null,
    maxTemp: null,
    error: null,
  });

  const [newSpawn, setNewSpawn] = useState({
    species: "Blue Oyster",
    supplier: "Amelium",
    lotCode: "",
    receivedDate: isoToday(),
    bagsReceived: 1,
    notes: "",
  });

  const [newLot, setNewLot] = useState({
    species: "Blue Oyster",
    lotCode: "",
    inoculationDate: isoToday(),
    blocksCreated: 10,
    spawnBagsUsed: 1,
    spawnReceiptId: "",
    notes: "",
  });

  const [moveForm, setMoveForm] = useState({
    lotId: "",
    movedDate: isoToday(),
    blocksMoved: 1,
    notes: "",
  });

  const [harvestForm, setHarvestForm] = useState({
    lotCode: "",
    harvestDate: isoToday(),
    pounds: 1,
    notes: "",
  });

  const [lossForm, setLossForm] = useState({
    lotCode: "",
    lossDate: isoToday(),
    blocksLost: 1,
    reason: "contamination",
    notes: "",
  });

  useEffect(() => {
    saveAppState({ moves, harvests, losses });
  }, [moves, harvests, losses]);

  useEffect(() => {
    async function fetchData() {
      const [{ data: spawnData, error: spawnError }, { data: lotsData, error: lotsError }] =
        await Promise.all([
          supabase.from("spawn_receipts").select("*").order("received_date", { ascending: true }),
          supabase.from("lots_v2").select("*").order("created_at", { ascending: false }),
        ]);

      if (spawnError) {
        console.error("Error loading spawn receipts:", spawnError);
      } else {
        setSpawnInventory((spawnData || []).map(mapSpawnRow));
      }

      if (lotsError) {
        console.error("Error loading lots:", lotsError);
      } else {
        setLots((lotsData || []).map(mapLotRow));
      }
    }

    fetchData();
  }, []);

  useEffect(() => {
    async function loadWeather() {
      try {
        setWeather((prev) => ({ ...prev, loading: true, error: null }));
        const url =
          "https://api.open-meteo.com/v1/forecast?latitude=45.4042&longitude=-71.8929&current=temperature_2m&daily=temperature_2m_max,temperature_2m_min&timezone=America%2FToronto&forecast_days=1";
        const response = await fetch(url);
        if (!response.ok) throw new Error("Weather request failed");
        const data = await response.json();

        setWeather({
          loading: false,
          location: "Sherbrooke, Quebec",
          currentTemp: data?.current?.temperature_2m ?? null,
          minTemp: data?.daily?.temperature_2m_min?.[0] ?? null,
          maxTemp: data?.daily?.temperature_2m_max?.[0] ?? null,
          error: null,
        });
      } catch {
        setWeather({
          loading: false,
          location: "Sherbrooke, Quebec",
          currentTemp: null,
          minTemp: null,
          maxTemp: null,
          error: "Weather unavailable right now",
        });
      }
    }

    loadWeather();
  }, []);

  const availableSpawnOptionsForNewLot = useMemo(() => {
    return spawnInventory
      .filter((item) => item.species === newLot.species && Number(item.bagsRemaining) > 0)
      .sort((a, b) => new Date(a.receivedDate) - new Date(b.receivedDate));
  }, [spawnInventory, newLot.species]);

  useEffect(() => {
    if (!availableSpawnOptionsForNewLot.length) {
      if (newLot.spawnReceiptId !== "") {
        setNewLot((prev) => ({ ...prev, spawnReceiptId: "" }));
      }
      return;
    }

    const stillValid = availableSpawnOptionsForNewLot.some(
      (item) => String(item.id) === String(newLot.spawnReceiptId)
    );

    if (!stillValid) {
      setNewLot((prev) => ({
        ...prev,
        spawnReceiptId: String(availableSpawnOptionsForNewLot[0].id),
      }));
    }
  }, [availableSpawnOptionsForNewLot, newLot.spawnReceiptId]);

  function resetApp() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  }

  function createLotCode(species, inoculationDate) {
    const code = speciesConfig[species].code;
    const sameDayCount =
      lots.filter((lot) => lot.species === species && lot.inoculationDate === inoculationDate).length + 1;

    return `${code}-${inoculationDate}-${String(sameDayCount).padStart(2, "0")}`;
  }

  function getSpawnById(id) {
    return spawnInventory.find((item) => String(item.id) === String(id)) || null;
  }

  function getSpawnUsageCount(spawnReceiptId) {
    return lots.filter((lot) => String(lot.spawnReceiptId) === String(spawnReceiptId)).length;
  }

  async function handleAddSpawn(e) {
    e.preventDefault();

    const dbEntry = {
      species: newSpawn.species,
      supplier: newSpawn.supplier,
      lot_code:
        newSpawn.lotCode ||
        `${speciesConfig[newSpawn.species].code}-SPAWN-${newSpawn.receivedDate}`,
      received_date: newSpawn.receivedDate,
      bags_received: Number(newSpawn.bagsReceived),
      bags_remaining: Number(newSpawn.bagsReceived),
      notes: newSpawn.notes || null,
    };

    const { data, error } = await supabase.from("spawn_receipts").insert([dbEntry]).select();

    if (error) {
      alert(`Supabase error: ${error.message}`);
      return;
    }

    const mapped = (data || []).map(mapSpawnRow);

    setSpawnInventory((prev) =>
      [...prev, ...mapped].sort((a, b) => new Date(a.receivedDate) - new Date(b.receivedDate))
    );

    setNewSpawn({
      species: "Blue Oyster",
      supplier: "Amelium",
      lotCode: "",
      receivedDate: isoToday(),
      bagsReceived: 1,
      notes: "",
    });
  }

  async function handleDeleteSpawn(id) {
    const usageCount = getSpawnUsageCount(id);

    if (usageCount > 0) {
      alert("This spawn batch is already linked to one or more production lots and cannot be deleted.");
      return;
    }

    const confirmed = window.confirm("Delete this spawn batch?");
    if (!confirmed) return;

    const { error } = await supabase.from("spawn_receipts").delete().eq("id", id);

    if (error) {
      alert(`Delete error: ${error.message}`);
      return;
    }

    setSpawnInventory((prev) => prev.filter((item) => String(item.id) !== String(id)));
  }

  async function handleAddLot(e) {
    e.preventDefault();

    if (!newLot.spawnReceiptId) {
      alert("Please select a spawn batch");
      return;
    }

    const species = newLot.species;
    const inoculationDate = newLot.inoculationDate;
    const expectedReadyDate = addDays(
      inoculationDate,
      speciesConfig[species].incubationDays
    );
    const lotCode = newLot.lotCode || createLotCode(species, inoculationDate);

    const { data, error } = await supabase.rpc("create_lot_and_deduct_spawn", {
  p_lot_code: lotCode,
  p_species: species,
  p_inoculation_date: inoculationDate,
  p_expected_ready_date: expectedReadyDate,
  p_blocks_created: Number(newLot.blocksCreated),
  p_spawn_bags_used: Number(newLot.spawnBagsUsed),
  p_spawn_receipt_id: newLot.spawnReceiptId,
  p_status: "incubating",
  p_notes: newLot.notes || "",
});

    if (error) {
      console.error("RPC ERROR:", error);
      alert(error.message);
      return;
    }

    const rpcRow = Array.isArray(data) ? data[0] : data;
    if (!rpcRow) {
      alert("Lot created but no row was returned by RPC.");
      return;
    }

    const mappedLot = mapLotRow(rpcRow);
    setLots((prev) => [mappedLot, ...prev]);

    setSpawnInventory((prev) =>
      prev.map((item) =>
        String(item.id) === String(newLot.spawnReceiptId)
          ? {
              ...item,
              bagsRemaining: Number(item.bagsRemaining) - Number(newLot.spawnBagsUsed),
            }
          : item
      )
    );

    setNewLot({
      species: "Blue Oyster",
      lotCode: "",
      inoculationDate: isoToday(),
      blocksCreated: 10,
      spawnBagsUsed: 1,
      spawnReceiptId: "",
      notes: "",
    });
  }

  async function handleDeleteLot(id) {
    const lot = lots.find((item) => String(item.id) === String(id));
    if (!lot) return;

    const moveLinked = moves.some((item) => item.lotId === id || item.lotCode === lot.lotCode);
    const harvestLinked = harvests.some((item) => item.lotCode === lot.lotCode);
    const lossLinked = losses.some((item) => item.lotCode === lot.lotCode);

    if (moveLinked || harvestLinked || lossLinked) {
      alert(
        "This lot already has fruiting, harvest, or loss history linked to it and cannot be deleted safely."
      );
      return;
    }

    const confirmed = window.confirm(
      `Delete lot ${lot.lotCode}? This will restore ${lot.spawnBagsUsed} spawn bag(s) to the linked spawn batch.`
    );
    if (!confirmed) return;

    const { error: deleteError } = await supabase.from("lots_v2").delete().eq("id", id);

    if (deleteError) {
      alert(`Delete error: ${deleteError.message}`);
      return;
    }

    if (lot.spawnReceiptId) {
      const linkedSpawn = getSpawnById(lot.spawnReceiptId);

      if (linkedSpawn) {
        const restoredRemaining = Number(linkedSpawn.bagsRemaining) + Number(lot.spawnBagsUsed);

        const { error: restoreError } = await supabase
          .from("spawn_receipts")
          .update({ bags_remaining: restoredRemaining })
          .eq("id", lot.spawnReceiptId);

        if (restoreError) {
          alert(`Lot deleted, but spawn restoration failed: ${restoreError.message}`);
          return;
        }

        setSpawnInventory((prev) =>
          prev.map((item) =>
            String(item.id) === String(lot.spawnReceiptId)
              ? { ...item, bagsRemaining: restoredRemaining }
              : item
          )
        );
      }
    }

    setLots((prev) => prev.filter((item) => String(item.id) !== String(id)));
  }

  function handleMoveToFruiting(e) {
    e.preventDefault();

    const lot = lots.find((item) => String(item.id) === String(moveForm.lotId));
    if (!lot) return;

    const movedCount = Number(moveForm.blocksMoved);

    if (movedCount <= 0 || movedCount > Number(lot.blocksAvailable)) {
      alert("Invalid block quantity.");
      return;
    }

    const moveEntry = {
      id: crypto.randomUUID(),
      lotId: lot.id,
      lotCode: lot.lotCode,
      species: lot.species,
      movedDate: moveForm.movedDate,
      blocksMoved: movedCount,
      notes: moveForm.notes,
    };

    setMoves((prev) => [moveEntry, ...prev]);

    setLots((prev) =>
      prev.map((item) => {
        if (String(item.id) !== String(lot.id)) return item;
        const remaining = Number(item.blocksAvailable) - movedCount;

        return {
          ...item,
          blocksAvailable: remaining,
          status: remaining === 0 ? "moved" : "incubating",
        };
      })
    );

    setMoveForm({ lotId: "", movedDate: isoToday(), blocksMoved: 1, notes: "" });
  }

  function handleAddHarvest(e) {
    e.preventDefault();

    const lotSource =
      lots.find((item) => item.lotCode === harvestForm.lotCode) ||
      moves.find((item) => item.lotCode === harvestForm.lotCode);

    if (!lotSource) {
      alert("Lot not found.");
      return;
    }

    const pounds = Number(harvestForm.pounds);

    if (pounds <= 0) {
      alert("Harvest weight must be greater than 0.");
      return;
    }

    const entry = {
      id: crypto.randomUUID(),
      lotCode: harvestForm.lotCode,
      species: lotSource.species,
      harvestDate: harvestForm.harvestDate,
      pounds,
      notes: harvestForm.notes,
    };

    setHarvests((prev) => [entry, ...prev]);
    setLots((prev) =>
      prev.map((lot) =>
        lot.lotCode === harvestForm.lotCode ? { ...lot, status: "closed" } : lot
      )
    );

    setHarvestForm({ lotCode: "", harvestDate: isoToday(), pounds: 1, notes: "" });
  }

  function handleAddLoss(e) {
    e.preventDefault();

    const lot = lots.find((item) => item.lotCode === lossForm.lotCode);
    if (!lot) {
      alert("Lot not found.");
      return;
    }

    const blocksLost = Number(lossForm.blocksLost);

    if (blocksLost <= 0 || blocksLost > Number(lot.blocksAvailable)) {
      alert("Invalid lost block quantity.");
      return;
    }

    const entry = {
      id: crypto.randomUUID(),
      lotCode: lot.lotCode,
      species: lot.species,
      lossDate: lossForm.lossDate,
      blocksLost,
      reason: lossForm.reason,
      notes: lossForm.notes,
    };

    setLosses((prev) => [entry, ...prev]);

    setLots((prev) =>
      prev.map((item) => {
        if (item.lotCode !== lossForm.lotCode) return item;
        const remaining = Number(item.blocksAvailable) - blocksLost;

        return {
          ...item,
          blocksAvailable: remaining,
          status: remaining === 0 ? "closed" : item.status,
        };
      })
    );

    setLossForm({
      lotCode: "",
      lossDate: isoToday(),
      blocksLost: 1,
      reason: "contamination",
      notes: "",
    });
  }

  const lowSpawnAlerts = useMemo(
    () => spawnInventory.filter((item) => Number(item.bagsRemaining) < 3),
    [spawnInventory]
  );

  const lotsWithTiming = useMemo(() => {
    const today = new Date();

    return lots.map((lot) => {
      const effectiveStatus = getEffectiveLotStatus(lot);
      const daysInIncubation = diffInDays(lot.inoculationDate, today);
      const isReady = effectiveStatus === "ready";
      const isOverdue =
        isReady &&
        new Date(`${lot.expectedReadyDate}T12:00:00`) < new Date(`${isoToday()}T00:00:00`);

      return {
        ...lot,
        effectiveStatus,
        daysInIncubation,
        isReady,
        isOverdue,
      };
    });
  }, [lots]);

  const activeLots = useMemo(
    () =>
      lotsWithTiming.filter(
        (lot) => lot.effectiveStatus === "incubating" || lot.effectiveStatus === "ready"
      ),
    [lotsWithTiming]
  );

  const readyLots = lotsWithTiming.filter((lot) => lot.isReady && lot.blocksAvailable > 0);
  const overdueLots = lotsWithTiming.filter((lot) => lot.isOverdue && lot.blocksAvailable > 0);

  const totalIncubatingBlocks = activeLots.reduce(
    (sum, lot) => sum + Number(lot.blocksAvailable || 0),
    0
  );

  const dueThisWeekBlocks = lotsWithTiming
    .filter((lot) => Number(lot.blocksAvailable) > 0)
    .filter((lot) => {
      const ready = new Date(`${lot.expectedReadyDate}T12:00:00`);
      const today = new Date(`${isoToday()}T12:00:00`);
      const in7 = new Date(today);
      in7.setDate(today.getDate() + 7);
      return ready >= today && ready <= in7;
    })
    .reduce((sum, lot) => sum + Number(lot.blocksAvailable || 0), 0);

  const weeklyHarvestTotal = harvests
    .filter((entry) => {
      const harvestDate = new Date(`${entry.harvestDate}T12:00:00`);
      const today = new Date(`${isoToday()}T12:00:00`);
      const weekAgo = new Date(today);
      weekAgo.setDate(today.getDate() - 7);
      return harvestDate >= weekAgo && harvestDate <= today;
    })
    .reduce((sum, entry) => sum + Number(entry.pounds || 0), 0);

  const averageYieldPerBlock = useMemo(() => {
    const yields = harvests
      .map((harvest) => {
        const lot = lots.find((item) => item.lotCode === harvest.lotCode);
        const moved = moves.find((item) => item.lotCode === harvest.lotCode);
        const baseBlocks = moved?.blocksMoved || lot?.blocksCreated || 0;
        if (!baseBlocks) return null;
        return Number(harvest.pounds) / Number(baseBlocks);
      })
      .filter((value) => value !== null);

    return average(yields);
  }, [harvests, lots, moves]);

  const expectedNext14Days = useMemo(() => {
    const today = new Date(`${isoToday()}T12:00:00`);
    const in14 = new Date(today);
    in14.setDate(today.getDate() + 14);

    return lotsWithTiming
      .filter((lot) => Number(lot.blocksAvailable) > 0)
      .filter((lot) => {
        const ready = new Date(`${lot.expectedReadyDate}T12:00:00`);
        return ready >= today && ready <= in14;
      })
      .reduce((sum, lot) => sum + Number(lot.blocksAvailable || 0), 0);
  }, [lotsWithTiming]);

  const speciesSummary = useMemo(() => {
    return Object.keys(speciesConfig).map((species) => {
      const incubatingBlocks = activeLots
        .filter((lot) => lot.species === species)
        .reduce((sum, lot) => sum + Number(lot.blocksAvailable || 0), 0);

      const spawnRemaining = spawnInventory
        .filter((item) => item.species === species)
        .reduce((sum, item) => sum + Number(item.bagsRemaining || 0), 0);

      const speciesHarvests = harvests.filter((item) => item.species === species);

      const avgLotYield = average(
        speciesHarvests.map((harvest) => {
          const moved = moves.find((item) => item.lotCode === harvest.lotCode);
          const lot = lots.find((item) => item.lotCode === harvest.lotCode);
          const blocks = moved?.blocksMoved || lot?.blocksCreated || 0;
          return blocks ? Number(harvest.pounds) / Number(blocks) : 0;
        })
      );

      const speciesLosses = losses
        .filter((item) => item.species === species)
        .reduce((sum, item) => sum + Number(item.blocksLost || 0), 0);

      return { species, incubatingBlocks, spawnRemaining, avgLotYield, speciesLosses };
    });
  }, [activeLots, spawnInventory, harvests, moves, lots, losses]);

  const lotAnalytics = useMemo(() => {
    const codes = Array.from(
      new Set([...lots.map((l) => l.lotCode), ...harvests.map((h) => h.lotCode)])
    );

    return codes.map((lotCode) => {
      const lot = lots.find((l) => l.lotCode === lotCode);
      const move = moves.find((m) => m.lotCode === lotCode);
      const lotHarvests = harvests.filter((h) => h.lotCode === lotCode);
      const totalHarvest = lotHarvests.reduce((sum, h) => sum + Number(h.pounds || 0), 0);
      const blocks = move?.blocksMoved || lot?.blocksCreated || 0;
      const yieldPerBlock = blocks ? totalHarvest / Number(blocks) : 0;
      const lotLosses = losses
        .filter((loss) => loss.lotCode === lotCode)
        .reduce((sum, loss) => sum + Number(loss.blocksLost || 0), 0);

      return {
        lotCode,
        species: lot?.species || move?.species || lotHarvests[0]?.species || "—",
        blocks,
        totalHarvest,
        yieldPerBlock,
        lotLosses,
        status: lot?.status || (totalHarvest > 0 ? "closed" : "moved"),
      };
    });
  }, [lots, harvests, moves, losses]);

  const weeklyHarvests = groupByWeek(harvests);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8">
        <div className="mb-8 grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
          <Card className="rounded-3xl border-0 bg-gradient-to-br from-slate-900 to-slate-700 text-white shadow-xl">
            <CardContent className="p-6 md:p-8">
              <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-slate-300">
                    Le Réseau Souterrain
                  </p>
                  <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
                    Mushroom Farm Manager
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm text-slate-300 md:text-base">
                    Centralized tracking for spawn inventory, inoculation lots, incubation,
                    fruiting moves, harvest yields, contamination, and weather context.
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    Spawn and lots use Supabase. Moves, harvests, and losses are still local only.
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
                      <div className="text-slate-300">Location</div>
                      <div className="mt-1 font-medium">Sherbrooke, QC</div>
                    </div>
                    <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
                      <div className="text-slate-300">Mode</div>
                      <div className="mt-1 font-medium">Supabase live</div>
                    </div>
                  </div>

                  <Button onClick={resetApp} variant="secondary" className="rounded-2xl">
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Reset Local Data
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CloudSun className="h-5 w-5" />
                Weather context
              </CardTitle>
            </CardHeader>
            <CardContent>
              {weather.loading ? (
                <p className="text-sm text-slate-500">Loading Sherbrooke weather...</p>
              ) : weather.error ? (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Weather unavailable</AlertTitle>
                  <AlertDescription>{weather.error}</AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-slate-500">Current outdoor temperature</p>
                    <p className="text-3xl font-semibold">{weather.currentTemp}°C</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl bg-slate-100 p-4">
                      <div className="text-slate-500">Today min</div>
                      <div className="mt-1 text-lg font-medium">{weather.minTemp}°C</div>
                    </div>
                    <div className="rounded-2xl bg-slate-100 p-4">
                      <div className="text-slate-500">Today max</div>
                      <div className="mt-1 text-lg font-medium">{weather.maxTemp}°C</div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            title="Incubating blocks"
            value={totalIncubatingBlocks}
            subtitle="Active lots only"
            icon={Sprout}
          />
          <MetricCard
            title="Due this week"
            value={dueThisWeekBlocks}
            subtitle="Blocks expected ready in 7 days"
            icon={CalendarClock}
          />
          <MetricCard
            title="Harvest this week"
            value={`${weeklyHarvestTotal} lb`}
            subtitle="Rolling 7-day harvest total"
            icon={Scale}
          />
          <MetricCard
            title="Avg yield / block"
            value={`${averageYieldPerBlock.toFixed(2)} lb`}
            subtitle="Across harvested lots"
            icon={FlaskConical}
          />
          <MetricCard
            title="Expected next 14 days"
            value={expectedNext14Days}
            subtitle="Blocks likely ready to fruit"
            icon={Package}
          />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            {lowSpawnAlerts.length > 0 ? (
              <Alert className="rounded-2xl border-amber-200 bg-amber-50">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Low spawn inventory</AlertTitle>
                <AlertDescription>
                  {lowSpawnAlerts
                    .map((item) => `${item.species}: ${item.bagsRemaining} bag(s) remaining`)
                    .join(" • ")}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="rounded-2xl border-emerald-200 bg-emerald-50">
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Spawn stock looks good</AlertTitle>
                <AlertDescription>
                  No species is currently below the 3-bag alert threshold.
                </AlertDescription>
              </Alert>
            )}

            {readyLots.length > 0 && (
              <Alert className="rounded-2xl border-blue-200 bg-blue-50">
                <CalendarClock className="h-4 w-4" />
                <AlertTitle>Lots ready to move</AlertTitle>
                <AlertDescription>
                  {readyLots
                    .map((lot) => `${lot.lotCode} (${lot.blocksAvailable} blocks)`)
                    .join(" • ")}
                </AlertDescription>
              </Alert>
            )}

            {overdueLots.length > 0 && (
              <Alert className="rounded-2xl border-rose-200 bg-rose-50">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Overdue incubation lots</AlertTitle>
                <AlertDescription>
                  {overdueLots
                    .map((lot) => `${lot.lotCode} overdue since ${formatDate(lot.expectedReadyDate)}`)
                    .join(" • ")}
                </AlertDescription>
              </Alert>
            )}
          </div>

          <Card className="rounded-3xl shadow-sm">
            <CardHeader>
              <CardTitle>Species summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-3">
                {speciesSummary.map((item) => (
                  <div key={item.species} className="rounded-2xl border bg-white p-4">
                    <div className="text-base font-medium">{item.species}</div>
                    <div className="mt-3 space-y-2 text-sm text-slate-600">
                      <div>
                        Incubating:{" "}
                        <span className="font-medium text-slate-900">{item.incubatingBlocks}</span>
                      </div>
                      <div>
                        Spawn:{" "}
                        <span className="font-medium text-slate-900">{item.spawnRemaining} bags</span>
                      </div>
                      <div>
                        Avg yield/block:{" "}
                        <span className="font-medium text-slate-900">
                          {item.avgLotYield.toFixed(2)} lb
                        </span>
                      </div>
                      <div>
                        Losses:{" "}
                        <span className="font-medium text-slate-900">{item.speciesLosses} blocks</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="dashboard" className="mt-8">
          <TabsList className="grid w-full grid-cols-3 gap-2 rounded-2xl bg-white p-2 md:grid-cols-7">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="spawn">Spawn</TabsTrigger>
            <TabsTrigger value="lots">Production Lots</TabsTrigger>
            <TabsTrigger value="incubation">Incubation</TabsTrigger>
            <TabsTrigger value="fruiting">Fruiting</TabsTrigger>
            <TabsTrigger value="harvests">Harvests</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-6 space-y-6">
            <Card className="rounded-3xl shadow-sm">
              <CardHeader>
                <CardTitle>Weekly harvest trend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-4">
                  {weeklyHarvests.length ? (
                    weeklyHarvests.map((entry) => (
                      <div key={entry.weekStart} className="rounded-2xl bg-slate-100 p-4">
                        <div className="text-sm text-slate-500">Week of {formatDate(entry.weekStart)}</div>
                        <div className="mt-2 text-2xl font-semibold">{entry.pounds} lb</div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">No harvest data yet.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="rounded-3xl shadow-sm">
                <CardHeader>
                  <CardTitle>Ready soon queue</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {lotsWithTiming
                      .filter((lot) => Number(lot.blocksAvailable) > 0)
                      .sort((a, b) => a.expectedReadyDate.localeCompare(b.expectedReadyDate))
                      .slice(0, 6)
                      .map((lot) => (
                        <div key={lot.id} className="flex items-center justify-between rounded-2xl border p-4">
                          <div>
                            <div className="font-medium">{lot.lotCode}</div>
                            <div className="text-sm text-slate-500">
                              {lot.species} · {lot.blocksAvailable} blocks
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium">{formatDate(lot.expectedReadyDate)}</div>
                            <Badge
                              variant={
                                lot.isOverdue
                                  ? "destructive"
                                  : lot.isReady
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {lot.isOverdue ? "Overdue" : lot.isReady ? "Ready" : lot.effectiveStatus}
                            </Badge>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-3xl shadow-sm">
                <CardHeader>
                  <CardTitle>Recent activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    {[
                      ...harvests.slice(0, 3).map((h) => ({
                        date: h.harvestDate,
                        text: `Harvest logged: ${h.lotCode} · ${h.pounds} lb`,
                      })),
                      ...moves.slice(0, 3).map((m) => ({
                        date: m.movedDate,
                        text: `Moved to fruiting: ${m.lotCode} · ${m.blocksMoved} blocks`,
                      })),
                      ...losses.slice(0, 3).map((l) => ({
                        date: l.lossDate,
                        text: `Loss logged: ${l.lotCode} · ${l.blocksLost} blocks (${l.reason})`,
                      })),
                    ]
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .slice(0, 8)
                      .map((event, index) => (
                        <div key={`${event.date}-${index}`} className="rounded-2xl border p-4">
                          <div className="font-medium">{event.text}</div>
                          <div className="text-slate-500">{formatDate(event.date)}</div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="spawn" className="mt-6 space-y-6">
            <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
              <Card className="rounded-3xl shadow-sm">
                <CardHeader>
                  <CardTitle>Add spawn inventory</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleAddSpawn} className="space-y-4">
                    <div>
                      <Label>Species</Label>
                      <Select
                        value={newSpawn.species}
                        onValueChange={(value) =>
                          setNewSpawn((prev) => ({ ...prev, species: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.keys(speciesConfig).map((species) => (
                            <SelectItem key={species} value={species}>
                              {species}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Supplier</Label>
                      <Input
                        value={newSpawn.supplier}
                        onChange={(e) =>
                          setNewSpawn((prev) => ({ ...prev, supplier: e.target.value }))
                        }
                      />
                    </div>

                    <div>
                      <Label>Spawn lot code</Label>
                      <Input
                        value={newSpawn.lotCode}
                        onChange={(e) =>
                          setNewSpawn((prev) => ({ ...prev, lotCode: e.target.value }))
                        }
                        placeholder="Optional"
                      />
                    </div>

                    <div>
                      <Label>Received date</Label>
                      <Input
                        type="date"
                        value={newSpawn.receivedDate}
                        onChange={(e) =>
                          setNewSpawn((prev) => ({ ...prev, receivedDate: e.target.value }))
                        }
                      />
                    </div>

                    <div>
                      <Label>Bags received</Label>
                      <Input
                        type="number"
                        min="1"
                        value={newSpawn.bagsReceived}
                        onChange={(e) =>
                          setNewSpawn((prev) => ({ ...prev, bagsReceived: e.target.value }))
                        }
                      />
                    </div>

                    <div>
                      <Label>Notes</Label>
                      <Textarea
                        value={newSpawn.notes}
                        onChange={(e) =>
                          setNewSpawn((prev) => ({ ...prev, notes: e.target.value }))
                        }
                        rows={3}
                      />
                    </div>

                    <Button className="w-full rounded-2xl">
                      <Plus className="mr-2 h-4 w-4" />
                      Add spawn receipt
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="rounded-3xl shadow-sm">
                <CardHeader>
                  <CardTitle>Spawn inventory status</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Species</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Lot</TableHead>
                        <TableHead>Received</TableHead>
                        <TableHead>Total bags</TableHead>
                        <TableHead>Remaining</TableHead>
                        <TableHead>Linked lots</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {spawnInventory.map((item) => {
                        const usageCount = getSpawnUsageCount(item.id);
                        const isProtected = usageCount > 0;

                        return (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.species}</TableCell>
                            <TableCell>{item.supplier}</TableCell>
                            <TableCell>{item.lotCode}</TableCell>
                            <TableCell>{formatDate(item.receivedDate)}</TableCell>
                            <TableCell>{item.bagsReceived}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span>{item.bagsRemaining}</span>
                                {item.bagsRemaining < 3 ? <Badge variant="destructive">Low</Badge> : null}
                              </div>
                            </TableCell>
                            <TableCell>
                              {usageCount > 0 ? <Badge variant="secondary">{usageCount}</Badge> : "0"}
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={isProtected}
                                onClick={() => handleDeleteSpawn(item.id)}
                                className="rounded-xl"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>

                  {!spawnInventory.length && (
                    <p className="mt-4 text-sm text-slate-500">No spawn inventory yet.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="lots" className="mt-6 space-y-6">
            <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
              <Card className="rounded-3xl shadow-sm">
                <CardHeader>
                  <CardTitle>Create production lot</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleAddLot} className="space-y-4">
                    <div>
                      <Label>Species</Label>
                      <Select
                        value={newLot.species}
                        onValueChange={(value) =>
                          setNewLot((prev) => ({
                            ...prev,
                            species: value,
                            spawnReceiptId: "",
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.keys(speciesConfig).map((species) => (
                            <SelectItem key={species} value={species}>
                              {species}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Spawn batch</Label>
                      <Select
                        value={newLot.spawnReceiptId}
                        onValueChange={(value) =>
                          setNewLot((prev) => ({ ...prev, spawnReceiptId: value }))
                        }
                        disabled={!availableSpawnOptionsForNewLot.length}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              availableSpawnOptionsForNewLot.length
                                ? "Select a spawn batch"
                                : "No matching spawn available"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {availableSpawnOptionsForNewLot.map((item) => (
                            <SelectItem key={item.id} value={String(item.id)}>
                              {item.lotCode} · {item.supplier} · {item.bagsRemaining} bag(s) left
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Lot code</Label>
                      <Input
                        value={newLot.lotCode}
                        onChange={(e) =>
                          setNewLot((prev) => ({ ...prev, lotCode: e.target.value }))
                        }
                        placeholder="Optional auto-generated if blank"
                      />
                    </div>

                    <div>
                      <Label>Inoculation date</Label>
                      <Input
                        type="date"
                        value={newLot.inoculationDate}
                        onChange={(e) =>
                          setNewLot((prev) => ({ ...prev, inoculationDate: e.target.value }))
                        }
                      />
                    </div>

                    <div>
                      <Label>Blocks created</Label>
                      <Input
                        type="number"
                        min="1"
                        value={newLot.blocksCreated}
                        onChange={(e) =>
                          setNewLot((prev) => ({ ...prev, blocksCreated: e.target.value }))
                        }
                      />
                    </div>

                    <div>
                      <Label>Spawn bags used</Label>
                      <Input
                        type="number"
                        min="1"
                        value={newLot.spawnBagsUsed}
                        onChange={(e) =>
                          setNewLot((prev) => ({ ...prev, spawnBagsUsed: e.target.value }))
                        }
                      />
                    </div>

                    <div className="rounded-2xl bg-slate-100 p-4 text-sm text-slate-600">
                      Expected ready date:{" "}
                      <span className="font-medium text-slate-900">
                        {formatDate(
                          addDays(newLot.inoculationDate, speciesConfig[newLot.species].incubationDays)
                        )}
                      </span>
                    </div>

                    <div>
                      <Label>Notes</Label>
                      <Textarea
                        value={newLot.notes}
                        onChange={(e) =>
                          setNewLot((prev) => ({ ...prev, notes: e.target.value }))
                        }
                        rows={3}
                      />
                    </div>

                    <Button className="w-full rounded-2xl" disabled={!availableSpawnOptionsForNewLot.length}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create lot
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="rounded-3xl shadow-sm">
                <CardHeader>
                  <CardTitle>Production lots</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lot</TableHead>
                        <TableHead>Species</TableHead>
                        <TableHead>Spawn batch</TableHead>
                        <TableHead>Inoculated</TableHead>
                        <TableHead>Ready</TableHead>
                        <TableHead>Blocks</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lotsWithTiming.map((lot) => {
                        const linkedSpawn = getSpawnById(lot.spawnReceiptId);

                        return (
                          <TableRow key={lot.id}>
                            <TableCell className="font-medium">{lot.lotCode}</TableCell>
                            <TableCell>{lot.species}</TableCell>
                            <TableCell>{linkedSpawn?.lotCode || "Missing"}</TableCell>
                            <TableCell>{formatDate(lot.inoculationDate)}</TableCell>
                            <TableCell>{formatDate(lot.expectedReadyDate)}</TableCell>
                            <TableCell>
                              {lot.blocksAvailable} / {lot.blocksCreated}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  lot.effectiveStatus === "ready"
                                    ? "default"
                                    : lot.effectiveStatus === "closed"
                                    ? "secondary"
                                    : lot.effectiveStatus === "moved"
                                    ? "outline"
                                    : "secondary"
                                }
                              >
                                {lot.effectiveStatus}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteLot(lot.id)}
                                className="rounded-xl"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>

                  {!lotsWithTiming.length && (
                    <p className="mt-4 text-sm text-slate-500">No production lots yet.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="incubation" className="mt-6">
            <Card className="rounded-3xl shadow-sm">
              <CardHeader>
                <CardTitle>Incubation inventory</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lot</TableHead>
                      <TableHead>Species</TableHead>
                      <TableHead>Days in incubation</TableHead>
                      <TableHead>Expected ready</TableHead>
                      <TableHead>Blocks available</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lotsWithTiming
                      .filter(
                        (lot) =>
                          Number(lot.blocksAvailable) > 0 &&
                          lot.effectiveStatus !== "closed" &&
                          lot.effectiveStatus !== "moved"
                      )
                      .map((lot) => (
                        <TableRow key={lot.id}>
                          <TableCell className="font-medium">{lot.lotCode}</TableCell>
                          <TableCell>{lot.species}</TableCell>
                          <TableCell>{lot.daysInIncubation}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {formatDate(lot.expectedReadyDate)}
                              {lot.isOverdue ? (
                                <Badge variant="destructive">Overdue</Badge>
                              ) : lot.isReady ? (
                                <Badge>Ready</Badge>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell>{lot.blocksAvailable}</TableCell>
                          <TableCell className="max-w-xs truncate">{lot.notes || "—"}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>

                {!lotsWithTiming.filter(
                  (lot) =>
                    Number(lot.blocksAvailable) > 0 &&
                    lot.effectiveStatus !== "closed" &&
                    lot.effectiveStatus !== "moved"
                ).length && <p className="mt-4 text-sm text-slate-500">No incubation lots yet.</p>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fruiting" className="mt-6 space-y-6">
            <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
              <Card className="rounded-3xl shadow-sm">
                <CardHeader>
                  <CardTitle>Move lot to fruiting</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleMoveToFruiting} className="space-y-4">
                    <div>
                      <Label>Lot</Label>
                      <Select
                        value={moveForm.lotId}
                        onValueChange={(value) => setMoveForm((prev) => ({ ...prev, lotId: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a lot" />
                        </SelectTrigger>
                        <SelectContent>
                          {lotsWithTiming
                            .filter(
                              (lot) =>
                                Number(lot.blocksAvailable) > 0 &&
                                lot.effectiveStatus !== "closed" &&
                                lot.effectiveStatus !== "moved"
                            )
                            .map((lot) => (
                              <SelectItem key={lot.id} value={String(lot.id)}>
                                {lot.lotCode} · {lot.blocksAvailable} blocks
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Moved date</Label>
                      <Input
                        type="date"
                        value={moveForm.movedDate}
                        onChange={(e) =>
                          setMoveForm((prev) => ({ ...prev, movedDate: e.target.value }))
                        }
                      />
                    </div>

                    <div>
                      <Label>Blocks moved</Label>
                      <Input
                        type="number"
                        min="1"
                        value={moveForm.blocksMoved}
                        onChange={(e) =>
                          setMoveForm((prev) => ({ ...prev, blocksMoved: e.target.value }))
                        }
                      />
                    </div>

                    <div>
                      <Label>Notes</Label>
                      <Textarea
                        rows={3}
                        value={moveForm.notes}
                        onChange={(e) =>
                          setMoveForm((prev) => ({ ...prev, notes: e.target.value }))
                        }
                      />
                    </div>

                    <Button className="w-full rounded-2xl">Move to fruiting</Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="rounded-3xl shadow-sm">
                <CardHeader>
                  <CardTitle>Fruiting moves log</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lot</TableHead>
                        <TableHead>Species</TableHead>
                        <TableHead>Moved date</TableHead>
                        <TableHead>Blocks moved</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {moves.map((move) => (
                        <TableRow key={move.id}>
                          <TableCell className="font-medium">{move.lotCode}</TableCell>
                          <TableCell>{move.species}</TableCell>
                          <TableCell>{formatDate(move.movedDate)}</TableCell>
                          <TableCell>{move.blocksMoved}</TableCell>
                          <TableCell className="max-w-xs truncate">{move.notes || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {!moves.length && <p className="mt-4 text-sm text-slate-500">No fruiting moves yet.</p>}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="harvests" className="mt-6 space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="rounded-3xl shadow-sm">
                <CardHeader>
                  <CardTitle>Log harvest</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleAddHarvest} className="space-y-4">
                    <div>
                      <Label>Lot code</Label>
                      <Select
                        value={harvestForm.lotCode}
                        onValueChange={(value) =>
                          setHarvestForm((prev) => ({ ...prev, lotCode: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select harvested lot" />
                        </SelectTrigger>
                        <SelectContent>
                          {moves.map((move) => (
                            <SelectItem key={move.id} value={move.lotCode}>
                              {move.lotCode}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Harvest date</Label>
                      <Input
                        type="date"
                        value={harvestForm.harvestDate}
                        onChange={(e) =>
                          setHarvestForm((prev) => ({ ...prev, harvestDate: e.target.value }))
                        }
                      />
                    </div>

                    <div>
                      <Label>Pounds harvested</Label>
                      <Input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={harvestForm.pounds}
                        onChange={(e) =>
                          setHarvestForm((prev) => ({ ...prev, pounds: e.target.value }))
                        }
                      />
                    </div>

                    <div>
                      <Label>Notes</Label>
                      <Textarea
                        rows={3}
                        value={harvestForm.notes}
                        onChange={(e) =>
                          setHarvestForm((prev) => ({ ...prev, notes: e.target.value }))
                        }
                      />
                    </div>

                    <Button className="w-full rounded-2xl">Add harvest</Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="rounded-3xl shadow-sm">
                <CardHeader>
                  <CardTitle>Log contamination / losses</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleAddLoss} className="space-y-4">
                    <div>
                      <Label>Lot code</Label>
                      <Select
                        value={lossForm.lotCode}
                        onValueChange={(value) => setLossForm((prev) => ({ ...prev, lotCode: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select lot" />
                        </SelectTrigger>
                        <SelectContent>
                          {lotsWithTiming
                            .filter((lot) => Number(lot.blocksAvailable) > 0)
                            .map((lot) => (
                              <SelectItem key={lot.id} value={lot.lotCode}>
                                {lot.lotCode}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Loss date</Label>
                        <Input
                          type="date"
                          value={lossForm.lossDate}
                          onChange={(e) =>
                            setLossForm((prev) => ({ ...prev, lossDate: e.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <Label>Blocks lost</Label>
                        <Input
                          type="number"
                          min="1"
                          value={lossForm.blocksLost}
                          onChange={(e) =>
                            setLossForm((prev) => ({ ...prev, blocksLost: e.target.value }))
                          }
                        />
                      </div>
                    </div>

                    <div>
                      <Label>Reason</Label>
                      <Select
                        value={lossForm.reason}
                        onValueChange={(value) => setLossForm((prev) => ({ ...prev, reason: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="contamination">Contamination</SelectItem>
                          <SelectItem value="stalled incubation">Stalled incubation</SelectItem>
                          <SelectItem value="damaged block">Damaged block</SelectItem>
                          <SelectItem value="discarded / other">Discarded / other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Notes</Label>
                      <Textarea
                        rows={3}
                        value={lossForm.notes}
                        onChange={(e) =>
                          setLossForm((prev) => ({ ...prev, notes: e.target.value }))
                        }
                      />
                    </div>

                    <Button className="w-full rounded-2xl">Log loss</Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-3xl shadow-sm">
              <CardHeader>
                <CardTitle>Harvest and loss history</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 lg:grid-cols-2">
                  <div>
                    <h3 className="mb-3 text-base font-medium">Harvest entries</h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Lot</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Species</TableHead>
                          <TableHead>lb</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {harvests.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell className="font-medium">{entry.lotCode}</TableCell>
                            <TableCell>{formatDate(entry.harvestDate)}</TableCell>
                            <TableCell>{entry.species}</TableCell>
                            <TableCell>{entry.pounds}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    {!harvests.length && (
                      <p className="mt-4 text-sm text-slate-500">No harvest entries yet.</p>
                    )}
                  </div>

                  <div>
                    <h3 className="mb-3 text-base font-medium">Loss entries</h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Lot</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>Blocks</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {losses.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell className="font-medium">{entry.lotCode}</TableCell>
                            <TableCell>{formatDate(entry.lossDate)}</TableCell>
                            <TableCell>{entry.reason}</TableCell>
                            <TableCell>{entry.blocksLost}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    {!losses.length && (
                      <p className="mt-4 text-sm text-slate-500">No loss entries yet.</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports" className="mt-6 space-y-6">
            <Card className="rounded-3xl shadow-sm">
              <CardHeader>
                <CardTitle>Yield by batch / lot</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lot</TableHead>
                      <TableHead>Species</TableHead>
                      <TableHead>Blocks</TableHead>
                      <TableHead>Total harvest</TableHead>
                      <TableHead>Yield / block</TableHead>
                      <TableHead>Losses</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lotAnalytics.map((row) => (
                      <TableRow key={row.lotCode}>
                        <TableCell className="font-medium">{row.lotCode}</TableCell>
                        <TableCell>{row.species}</TableCell>
                        <TableCell>{row.blocks || "—"}</TableCell>
                        <TableCell>{row.totalHarvest} lb</TableCell>
                        <TableCell>{row.yieldPerBlock.toFixed(2)} lb</TableCell>
                        <TableCell>{row.lotLosses}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{row.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {!lotAnalytics.length && (
                  <p className="mt-4 text-sm text-slate-500">No report data yet.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
