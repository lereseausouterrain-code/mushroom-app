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
  "Yellow Oyster": { code: "YO", incubationDays: 14 },
  "Black Pearl": { code: "BP", incubationDays: 21 },
  "Lion's Mane": { code: "LM", incubationDays: 20 },
  Chestnut: { code: "CH", incubationDays: 30 },
};

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isoToday() {
  return localDateString();
}

function parseLocalDate(dateString) {
  return new Date(`${dateString}T12:00:00`);
}

function addDays(dateString, days) {
  const date = parseLocalDate(dateString);
  date.setDate(date.getDate() + days);
  return localDateString(date);
}

function diffInDays(from, to = new Date()) {
  const a = parseLocalDate(from);
  const b = to instanceof Date ? to : new Date(to);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(dateString) {
  if (!dateString) return "—";
  return parseLocalDate(dateString).toLocaleDateString();
}

function groupByWeek(items) {
  const map = {};

  items.forEach((item) => {
    const date = parseLocalDate(item.harvestDate);
    const first = new Date(date);
    const day = first.getDay();
    const diff = first.getDate() - day + (day === 0 ? -6 : 1);
    first.setDate(diff);
    const key = localDateString(first);
    map[key] = (map[key] || 0) + Number(item.quantityKg || 0);
  });

  return Object.entries(map)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, quantityKg]) => ({ weekStart, quantityKg }));
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

function mapMoveRow(row, lotsLookup) {
  const lot = lotsLookup.find((item) => String(item.id) === String(row.lot_id));

  return {
    id: row.id,
    lotId: row.lot_id,
    lotCode: lot?.lotCode || "Unknown",
    species: lot?.species || "Unknown",
    movedDate: row.move_date,
    blocksMoved: Number(row.blocks_moved || 0),
    notes: row.notes ?? "",
    createdAt: row.created_at ?? null,
  };
}

function mapHarvestRow(row, lotsLookup) {
  const lot = lotsLookup.find((item) => String(item.id) === String(row.lot_id));

  return {
    id: row.id,
    lotId: row.lot_id,
    lotCode: lot?.lotCode || "Unknown",
    species: lot?.species || "Unknown",
    harvestDate: row.harvest_date,
    quantityKg: Number(row.quantity_kg || 0),
    notes: row.notes ?? "",
    createdAt: row.created_at ?? null,
  };
}

function mapLossRow(row, lotsLookup) {
  const lot = lotsLookup.find((item) => String(item.id) === String(row.lot_id));

  return {
    id: row.id,
    lotId: row.lot_id,
    lotCode: lot?.lotCode || "Unknown",
    species: lot?.species || "Unknown",
    lossDate: row.loss_date,
    blocksLost: Number(row.quantity_blocks || 0),
    reason: row.reason ?? "",
    notes: row.notes ?? "",
    createdAt: row.created_at ?? null,
  };
}

function MetricCard({ title, value, subtitle, icon }) {
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
            {React.createElement(icon, { className: "h-5 w-5" })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function getEffectiveLotStatus(lot) {
  if (lot.status === "closed" || lot.status === "moved") return lot.status;
  if (Number(lot.blocksAvailable || 0) <= 0) return "closed";

  const today = parseLocalDate(isoToday());
  const readyDate = parseLocalDate(lot.expectedReadyDate);

  return readyDate <= today ? "ready" : "incubating";
}

function getOpenLotStatus(expectedReadyDate) {
  const today = parseLocalDate(isoToday());
  const readyDate = parseLocalDate(expectedReadyDate);
  return readyDate <= today ? "ready" : "incubating";
}

export default function MushroomFarmManagerApp() {
  const [spawnInventory, setSpawnInventory] = useState([]);
  const [lots, setLots] = useState([]);
  const [moves, setMoves] = useState([]);
  const [harvests, setHarvests] = useState([]);
  const [losses, setLosses] = useState([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

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
    lotId: "",
    harvestDate: isoToday(),
    quantityKg: 1,
    notes: "",
  });

  const [lossForm, setLossForm] = useState({
    lotId: "",
    lossDate: isoToday(),
    blocksLost: 1,
    reason: "contamination",
    notes: "",
  });

  async function loadAllData() {
    setIsLoadingData(true);

    const [
      { data: spawnData, error: spawnError },
      { data: lotsData, error: lotsError },
      { data: movesData, error: movesError },
      { data: harvestsData, error: harvestsError },
      { data: lossesData, error: lossesError },
    ] = await Promise.all([
      supabase.from("spawn_receipts").select("*").order("received_date", { ascending: true }),
      supabase.from("lots_v2").select("*").order("created_at", { ascending: false }),
      supabase.from("moves").select("*").order("move_date", { ascending: false }),
      supabase.from("harvests").select("*").order("harvest_date", { ascending: false }),
      supabase.from("losses").select("*").order("loss_date", { ascending: false }),
    ]);

    if (spawnError) console.error("Error loading spawn receipts:", spawnError);
    if (lotsError) console.error("Error loading lots:", lotsError);
    if (movesError) console.error("Error loading moves:", movesError);
    if (harvestsError) console.error("Error loading harvests:", harvestsError);
    if (lossesError) console.error("Error loading losses:", lossesError);

    const mappedSpawn = (spawnData || []).map(mapSpawnRow);
    const mappedLots = (lotsData || []).map(mapLotRow);

    setSpawnInventory(mappedSpawn);
    setLots(mappedLots);
    setMoves((movesData || []).map((row) => mapMoveRow(row, mappedLots)));
    setHarvests((harvestsData || []).map((row) => mapHarvestRow(row, mappedLots)));
    setLosses((lossesData || []).map((row) => mapLossRow(row, mappedLots)));
    setIsLoadingData(false);
  }

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
  const channel = supabase
    .channel("realtime-farm")
    .on(
      "postgres_changes",
      { event: "*", schema: "public" },
      () => {
        loadAllData();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
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
      .sort((a, b) => parseLocalDate(a.receivedDate) - parseLocalDate(b.receivedDate));
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

  async function resetApp() {
    await loadAllData();
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

  function getLotById(id) {
    return lots.find((item) => String(item.id) === String(id)) || null;
  }

  function getSpawnUsageCount(spawnReceiptId) {
    return lots.filter((lot) => String(lot.spawnReceiptId) === String(spawnReceiptId)).length;
  }

  async function handleAddSpawn(e) {
    e.preventDefault();

    const bagsReceived = Number(newSpawn.bagsReceived);
    if (!bagsReceived || bagsReceived < 1) {
      alert("Bags received must be at least 1.");
      return;
    }

    const dbEntry = {
      species: newSpawn.species,
      supplier: newSpawn.supplier.trim(),
      lot_code:
        newSpawn.lotCode.trim() || `${speciesConfig[newSpawn.species].code}-SPAWN-${newSpawn.receivedDate}`,
      received_date: newSpawn.receivedDate,
      bags_received: bagsReceived,
      bags_remaining: bagsReceived,
      notes: newSpawn.notes.trim() || null,
    };

    const { error } = await supabase.from("spawn_receipts").insert([dbEntry]);

    if (error) {
      alert(`Supabase error: ${error.message}`);
      return;
    }

    await loadAllData();

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

    await loadAllData();
  }

  async function handleAddLot(e) {
    e.preventDefault();

    if (!newLot.spawnReceiptId) {
      alert("Please select a spawn batch.");
      return;
    }

    const selectedSpawn = getSpawnById(newLot.spawnReceiptId);
    if (!selectedSpawn) {
      alert("Selected spawn batch not found.");
      return;
    }

    const blocksCreated = Number(newLot.blocksCreated);
    const spawnBagsUsed = Number(newLot.spawnBagsUsed);

    if (!blocksCreated || blocksCreated < 1) {
      alert("Blocks created must be at least 1.");
      return;
    }

    if (!spawnBagsUsed || spawnBagsUsed < 1) {
      alert("Spawn bags used must be at least 1.");
      return;
    }

    if (spawnBagsUsed > Number(selectedSpawn.bagsRemaining)) {
      alert("Not enough spawn remaining in that batch.");
      return;
    }

    const species = newLot.species;
    const inoculationDate = newLot.inoculationDate;
    const expectedReadyDate = addDays(inoculationDate, speciesConfig[species].incubationDays);
    const lotCode = newLot.lotCode.trim() || createLotCode(species, inoculationDate);

    const { error } = await supabase.rpc("create_lot_and_deduct_spawn", {
      p_lot_code: lotCode,
      p_species: species,
      p_inoculation_date: inoculationDate,
      p_expected_ready_date: expectedReadyDate,
      p_blocks_created: blocksCreated,
      p_spawn_bags_used: spawnBagsUsed,
      p_spawn_receipt_id: newLot.spawnReceiptId,
      p_status: "incubating",
      p_notes: newLot.notes.trim() || "",
    });

    if (error) {
      console.error("RPC ERROR:", error);
      alert(error.message);
      return;
    }

    await loadAllData();

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
    const lot = getLotById(id);
    if (!lot) return;

    const moveLinked = moves.some((item) => String(item.lotId) === String(id));
    const harvestLinked = harvests.some((item) => String(item.lotId) === String(id));
    const lossLinked = losses.some((item) => String(item.lotId) === String(id));

    if (moveLinked || harvestLinked || lossLinked) {
      alert("This lot already has fruiting, harvest, or loss history linked to it and cannot be deleted safely.");
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
        }
      }
    }

    await loadAllData();
  }

  async function handleMoveToFruiting(e) {
    e.preventDefault();

    const lot = getLotById(moveForm.lotId);
    if (!lot) {
      alert("Lot not found.");
      return;
    }

    const movedCount = Number(moveForm.blocksMoved);

    if (!movedCount || movedCount <= 0 || movedCount > Number(lot.blocksAvailable)) {
      alert("Invalid block quantity.");
      return;
    }

    const { error } = await supabase.rpc("move_lot_to_fruiting", {
      p_lot_id: lot.id,
      p_move_date: moveForm.movedDate,
      p_blocks_moved: movedCount,
      p_notes: moveForm.notes.trim() || null,
    });

    if (error) {
      alert(`Move error: ${error.message}`);
      return;
    }

    await loadAllData();

    setMoveForm({ lotId: "", movedDate: isoToday(), blocksMoved: 1, notes: "" });
  }

  async function handleDeleteMove(id) {
  const move = moves.find((item) => String(item.id) === String(id));
  if (!move) return;

  const confirmed = window.confirm(
    `Delete move for ${move.lotCode} and restore ${move.blocksMoved} block(s)?`
  );
  if (!confirmed) return;

  try {
    const { error } = await supabase.rpc("delete_move_and_restore_blocks", {
      p_move_id: id,
    });

    if (error) {
      alert(`Move delete error: ${error.message}`);
      return;
    }

    await loadAllData();
  } catch (err) {
    alert(`Move delete failed: ${err.message}`);
  }
}

  async function handleAddHarvest(e) {
    e.preventDefault();

    const lot = getLotById(harvestForm.lotId);

    if (!lot) {
      alert("Lot not found.");
      return;
    }

    const quantityKg = Number(harvestForm.quantityKg);

    if (!quantityKg || quantityKg <= 0) {
      alert("Harvest quantity must be greater than 0.");
      return;
    }

    const { error } = await supabase.from("harvests").insert([
      {
        lot_id: lot.id,
        harvest_date: harvestForm.harvestDate,
        quantity_kg: quantityKg,
        notes: harvestForm.notes.trim() || null,
      },
    ]);

    if (error) {
      alert(`Harvest error: ${error.message}`);
      return;
    }

    await loadAllData();

    setHarvestForm({ lotId: "", harvestDate: isoToday(), quantityKg: 1, notes: "" });
  }

  async function handleDeleteHarvest(id) {
  const harvest = harvests.find((item) => String(item.id) === String(id));
  if (!harvest) return;

  const confirmed = window.confirm(`Delete harvest for ${harvest.lotCode}?`);
  if (!confirmed) return;

  try {
    const { error } = await supabase.rpc("delete_harvest_and_restore_blocks", {
      p_harvest_id: id,
    });

    if (error) {
      alert(`Harvest delete error: ${error.message}`);
      return;
    }

    await loadAllData();
  } catch (err) {
    alert(`Harvest delete failed: ${err.message}`);
  }
}

  async function handleAddLoss(e) {
    e.preventDefault();

    const lot = getLotById(lossForm.lotId);
    if (!lot) {
      alert("Lot not found.");
      return;
    }

    const blocksLost = Number(lossForm.blocksLost);

    if (!blocksLost || blocksLost <= 0 || blocksLost > Number(lot.blocksAvailable)) {
      alert("Invalid lost block quantity.");
      return;
    }

    const { error } = await supabase.rpc("log_lot_loss", {
      p_lot_id: lot.id,
      p_loss_date: lossForm.lossDate,
      p_blocks_lost: blocksLost,
      p_reason: lossForm.reason,
      p_notes: lossForm.notes.trim() || null,
    });

    if (error) {
      alert(`Loss error: ${error.message}`);
      return;
    }

    await loadAllData();

    setLossForm({
      lotId: "",
      lossDate: isoToday(),
      blocksLost: 1,
      reason: "contamination",
      notes: "",
    });
  }

  async function handleDeleteLoss(id) {
    const loss = losses.find((item) => String(item.id) === String(id));
    if (!loss) return;

    const lot = getLotById(loss.lotId);
    if (!lot) {
      alert("Linked lot not found.");
      return;
    }

    const confirmed = window.confirm(`Delete loss for ${loss.lotCode} and restore ${loss.blocksLost} block(s)?`);
    if (!confirmed) return;

    const restoredBlocks = Number(lot.blocksAvailable) + Number(loss.blocksLost);
    const restoredStatus = getOpenLotStatus(lot.expectedReadyDate);

    const { error: updateError } = await supabase
      .from("lots_v2")
      .update({
        blocks_available: restoredBlocks,
        status: restoredStatus,
      })
      .eq("id", lot.id);

    if (updateError) {
      alert(`Could not restore lot blocks: ${updateError.message}`);
      return;
    }

    const { error: deleteError } = await supabase.from("losses").delete().eq("id", id);

    if (deleteError) {
      alert(`Loss delete error: ${deleteError.message}`);
      await loadAllData();
      return;
    }

    await loadAllData();
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
      const isOverdue = isReady && parseLocalDate(lot.expectedReadyDate) < parseLocalDate(isoToday());

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
    () => lotsWithTiming.filter((lot) => lot.effectiveStatus === "incubating" || lot.effectiveStatus === "ready"),
    [lotsWithTiming]
  );

  const readyLots = lotsWithTiming.filter((lot) => lot.isReady && Number(lot.blocksAvailable) > 0);
  const overdueLots = lotsWithTiming.filter((lot) => lot.isOverdue && Number(lot.blocksAvailable) > 0);

  const totalIncubatingBlocks = activeLots.reduce((sum, lot) => sum + Number(lot.blocksAvailable || 0), 0);

  const dueThisWeekBlocks = lotsWithTiming
    .filter((lot) => Number(lot.blocksAvailable) > 0)
    .filter((lot) => {
      const ready = parseLocalDate(lot.expectedReadyDate);
      const today = parseLocalDate(isoToday());
      const in7 = new Date(today);
      in7.setDate(today.getDate() + 7);
      return ready >= today && ready <= in7;
    })
    .reduce((sum, lot) => sum + Number(lot.blocksAvailable || 0), 0);

  const weeklyHarvestTotal = harvests
    .filter((entry) => {
      const harvestDate = parseLocalDate(entry.harvestDate);
      const today = parseLocalDate(isoToday());
      const weekAgo = new Date(today);
      weekAgo.setDate(today.getDate() - 7);
      return harvestDate >= weekAgo && harvestDate <= today;
    })
    .reduce((sum, entry) => sum + Number(entry.quantityKg || 0), 0);

  const averageYieldPerBlock = useMemo(() => {
    const yields = harvests
      .map((harvest) => {
        const lot = lots.find((item) => String(item.id) === String(harvest.lotId));
        const moved = moves.find((item) => String(item.lotId) === String(harvest.lotId));
        const baseBlocks = moved?.blocksMoved || lot?.blocksCreated || 0;
        if (!baseBlocks) return null;
        return Number(harvest.quantityKg) / Number(baseBlocks);
      })
      .filter((value) => value !== null);

    return average(yields);
  }, [harvests, lots, moves]);

  const expectedNext14Days = useMemo(() => {
    const today = parseLocalDate(isoToday());
    const in14 = new Date(today);
    in14.setDate(today.getDate() + 14);

    return lotsWithTiming
      .filter((lot) => Number(lot.blocksAvailable) > 0)
      .filter((lot) => {
        const ready = parseLocalDate(lot.expectedReadyDate);
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
          const moved = moves.find((item) => String(item.lotId) === String(harvest.lotId));
          const lot = lots.find((item) => String(item.id) === String(harvest.lotId));
          const blocks = moved?.blocksMoved || lot?.blocksCreated || 0;
          return blocks ? Number(harvest.quantityKg) / Number(blocks) : 0;
        })
      );

      const speciesLosses = losses
        .filter((item) => item.species === species)
        .reduce((sum, item) => sum + Number(item.blocksLost || 0), 0);

      return { species, incubatingBlocks, spawnRemaining, avgLotYield, speciesLosses };
    });
  }, [activeLots, spawnInventory, harvests, moves, lots, losses]);

  const lotAnalytics = useMemo(() => {
    const ids = Array.from(new Set([...lots.map((l) => l.id), ...harvests.map((h) => h.lotId)]));

    return ids.map((lotId) => {
      const lot = lots.find((l) => String(l.id) === String(lotId));
      const move = moves.find((m) => String(m.lotId) === String(lotId));
      const lotHarvests = harvests.filter((h) => String(h.lotId) === String(lotId));
      const totalHarvest = lotHarvests.reduce((sum, h) => sum + Number(h.quantityKg || 0), 0);
      const blocks = move?.blocksMoved || lot?.blocksCreated || 0;
      const yieldPerBlock = blocks ? totalHarvest / Number(blocks) : 0;
      const lotLosses = losses
        .filter((loss) => String(loss.lotId) === String(lotId))
        .reduce((sum, loss) => sum + Number(loss.blocksLost || 0), 0);

      return {
        lotId,
        lotCode: lot?.lotCode || lotHarvests[0]?.lotCode || "—",
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

  const fruitingEligibleLots = lotsWithTiming.filter(
    (lot) => Number(lot.blocksAvailable) > 0 && lot.effectiveStatus !== "closed" && lot.effectiveStatus !== "moved"
  );

  const harvestEligibleLots = Array.from(
    new Map(
      moves
        .map((move) => lots.find((lot) => String(lot.id) === String(move.lotId)) || null)
        .filter(Boolean)
        .map((lot) => [String(lot.id), lot])
    ).values()
  );

  const lossEligibleLots = lotsWithTiming.filter((lot) => Number(lot.blocksAvailable) > 0);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8">
        <div className="mb-8 grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
          <Card className="rounded-3xl border-0 bg-gradient-to-br from-slate-900 to-slate-700 text-white shadow-xl">
            <CardContent className="p-6 md:p-8">
              <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-slate-300">Le Réseau Souterrain</p>
                  <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Mushroom Farm Manager</h1>
                  <p className="mt-3 max-w-2xl text-sm text-slate-300 md:text-base">
                    Centralized tracking for spawn inventory, inoculation lots, incubation, fruiting moves,
                    harvest yields, contamination, and weather context.
                  </p>
                  <p className="mt-2 text-xs text-slate-400">Spawn, lots, moves, harvests, and losses now use Supabase.</p>
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
                    Refresh Data
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

        <Tabs defaultValue="dashboard" className="mt-6">
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-slate-50 to-transparent md:hidden" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-slate-50 to-transparent md:hidden" />
            <div className="overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <TabsList className="flex w-max min-w-full snap-x snap-mandatory gap-2 rounded-2xl bg-white p-2 md:grid md:w-full md:grid-cols-7">
              <TabsTrigger value="dashboard" className="min-w-[8.5rem] flex-none snap-start md:min-w-0">
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="spawn" className="min-w-[7rem] flex-none snap-start md:min-w-0">
                Spawn
              </TabsTrigger>
              <TabsTrigger value="lots" className="min-w-[10rem] flex-none snap-start md:min-w-0">
                Production Lots
              </TabsTrigger>
              <TabsTrigger value="incubation" className="min-w-[8.5rem] flex-none snap-start md:min-w-0">
                Incubation
              </TabsTrigger>
              <TabsTrigger value="fruiting" className="min-w-[7rem] flex-none snap-start md:min-w-0">
                Fruiting
              </TabsTrigger>
              <TabsTrigger value="harvests" className="min-w-[7rem] flex-none snap-start md:min-w-0">
                Harvests
              </TabsTrigger>
              <TabsTrigger value="reports" className="min-w-[7rem] flex-none snap-start md:min-w-0">
                Reports
              </TabsTrigger>
              </TabsList>
            </div>
          </div>

          <TabsContent value="dashboard" className="mt-6 space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <MetricCard title="Incubating blocks" value={totalIncubatingBlocks} subtitle="Active lots only" icon={Sprout} />
              <MetricCard title="Due this week" value={dueThisWeekBlocks} subtitle="Blocks expected ready in 7 days" icon={CalendarClock} />
              <MetricCard title="Harvest this week" value={`${weeklyHarvestTotal.toFixed(2)} kg`} subtitle="Rolling 7-day harvest total" icon={Scale} />
              <MetricCard title="Avg yield / block" value={`${averageYieldPerBlock.toFixed(2)} kg`} subtitle="Across harvested lots" icon={FlaskConical} />
              <MetricCard title="Expected next 14 days" value={expectedNext14Days} subtitle="Blocks likely ready to fruit" icon={Package} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-4">
                {lowSpawnAlerts.length > 0 ? (
                  <Alert className="rounded-2xl border-amber-200 bg-amber-50">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Low spawn inventory</AlertTitle>
                    <AlertDescription>
                      {lowSpawnAlerts.map((item) => `${item.species}: ${item.bagsRemaining} bag(s) remaining`).join(" • ")}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert className="rounded-2xl border-emerald-200 bg-emerald-50">
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>Spawn stock looks good</AlertTitle>
                    <AlertDescription>No species is currently below the 3-bag alert threshold.</AlertDescription>
                  </Alert>
                )}

                {readyLots.length > 0 && (
                  <Alert className="rounded-2xl border-blue-200 bg-blue-50">
                    <CalendarClock className="h-4 w-4" />
                    <AlertTitle>Lots ready to move</AlertTitle>
                    <AlertDescription>
                      {readyLots.map((lot) => `${lot.lotCode} (${lot.blocksAvailable} blocks)`).join(" • ")}
                    </AlertDescription>
                  </Alert>
                )}

                {overdueLots.length > 0 && (
                  <Alert className="rounded-2xl border-rose-200 bg-rose-50">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Overdue incubation lots</AlertTitle>
                    <AlertDescription>
                      {overdueLots.map((lot) => `${lot.lotCode} overdue since ${formatDate(lot.expectedReadyDate)}`).join(" • ")}
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
                            Incubating: <span className="font-medium text-slate-900">{item.incubatingBlocks}</span>
                          </div>
                          <div>
                            Spawn: <span className="font-medium text-slate-900">{item.spawnRemaining} bags</span>
                          </div>
                          <div>
                            Avg yield/block: <span className="font-medium text-slate-900">{item.avgLotYield.toFixed(2)} kg</span>
                          </div>
                          <div>
                            Losses: <span className="font-medium text-slate-900">{item.speciesLosses} blocks</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="mt-10">
  <CardHeader>
    <CardTitle>Weekly harvest trend</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="grid gap-3 md:grid-cols-4">
      {weeklyHarvests.length ? (
        weeklyHarvests.map((entry) => (
          <div key={entry.weekStart} className="rounded-2xl bg-slate-100 p-4">
            <div className="text-sm text-slate-500">
              Week of {formatDate(entry.weekStart)}
            </div>
            <div className="mt-2 text-2xl font-semibold">
              {entry.quantityKg.toFixed(2)} kg
            </div>
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
                            <div className="text-sm text-slate-500">{lot.species} · {lot.blocksAvailable} blocks</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium">{formatDate(lot.expectedReadyDate)}</div>
                            <Badge
                              variant={
                                lot.isOverdue ? "destructive" : lot.isReady ? "default" : "secondary"
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
                      ...harvests.slice(0, 3).map((h) => ({ date: h.harvestDate, text: `Harvest logged: ${h.lotCode} · ${h.quantityKg} kg` })),
                      ...moves.slice(0, 3).map((m) => ({ date: m.movedDate, text: `Moved to fruiting: ${m.lotCode} · ${m.blocksMoved} blocks` })),
                      ...losses.slice(0, 3).map((l) => ({ date: l.lossDate, text: `Loss logged: ${l.lotCode} · ${l.blocksLost} blocks (${l.reason})` })),
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
                      <Select value={newSpawn.species} onValueChange={(value) => setNewSpawn((prev) => ({ ...prev, species: value }))}>
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
                      <Input value={newSpawn.supplier} onChange={(e) => setNewSpawn((prev) => ({ ...prev, supplier: e.target.value }))} />
                    </div>

                    <div>
                      <Label>Spawn lot code</Label>
                      <Input
                        value={newSpawn.lotCode}
                        onChange={(e) => setNewSpawn((prev) => ({ ...prev, lotCode: e.target.value }))}
                        placeholder="Optional"
                      />
                    </div>

                    <div>
                      <Label>Received date</Label>
                      <Input type="date" value={newSpawn.receivedDate} onChange={(e) => setNewSpawn((prev) => ({ ...prev, receivedDate: e.target.value }))} />
                    </div>

                    <div>
                      <Label>Bags received</Label>
                      <Input type="number" min="1" value={newSpawn.bagsReceived} onChange={(e) => setNewSpawn((prev) => ({ ...prev, bagsReceived: e.target.value }))} />
                    </div>

                    <div>
                      <Label>Notes</Label>
                      <Textarea value={newSpawn.notes} onChange={(e) => setNewSpawn((prev) => ({ ...prev, notes: e.target.value }))} rows={3} />
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
                            <TableCell>{usageCount > 0 ? <Badge variant="secondary">{usageCount}</Badge> : "0"}</TableCell>
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

                  {!spawnInventory.length && <p className="mt-4 text-sm text-slate-500">No spawn inventory yet.</p>}
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
                        onValueChange={(value) => setNewLot((prev) => ({ ...prev, spawnReceiptId: value }))}
                        disabled={!availableSpawnOptionsForNewLot.length}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              availableSpawnOptionsForNewLot.length ? "Select a spawn batch" : "No matching spawn available"
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
                        onChange={(e) => setNewLot((prev) => ({ ...prev, lotCode: e.target.value }))}
                        placeholder="Optional auto-generated if blank"
                      />
                    </div>

                    <div>
                      <Label>Inoculation date</Label>
                      <Input type="date" value={newLot.inoculationDate} onChange={(e) => setNewLot((prev) => ({ ...prev, inoculationDate: e.target.value }))} />
                    </div>

                    <div>
                      <Label>Blocks created</Label>
                      <Input type="number" min="1" value={newLot.blocksCreated} onChange={(e) => setNewLot((prev) => ({ ...prev, blocksCreated: e.target.value }))} />
                    </div>

                    <div>
                      <Label>Spawn bags used</Label>
                      <Input type="number" min="1" value={newLot.spawnBagsUsed} onChange={(e) => setNewLot((prev) => ({ ...prev, spawnBagsUsed: e.target.value }))} />
                    </div>

                    <div className="rounded-2xl bg-slate-100 p-4 text-sm text-slate-600">
                      Expected ready date: <span className="font-medium text-slate-900">{formatDate(addDays(newLot.inoculationDate, speciesConfig[newLot.species].incubationDays))}</span>
                    </div>

                    <div>
                      <Label>Notes</Label>
                      <Textarea value={newLot.notes} onChange={(e) => setNewLot((prev) => ({ ...prev, notes: e.target.value }))} rows={3} />
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
                            <TableCell>{lot.blocksAvailable} / {lot.blocksCreated}</TableCell>
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
                              <Button type="button" variant="outline" size="sm" onClick={() => handleDeleteLot(lot.id)} className="rounded-xl">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>

                  {!lotsWithTiming.length && <p className="mt-4 text-sm text-slate-500">No production lots yet.</p>}
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
                      .filter((lot) => Number(lot.blocksAvailable) > 0 && lot.effectiveStatus !== "closed" && lot.effectiveStatus !== "moved")
                      .map((lot) => (
                        <TableRow key={lot.id}>
                          <TableCell className="font-medium">{lot.lotCode}</TableCell>
                          <TableCell>{lot.species}</TableCell>
                          <TableCell>{lot.daysInIncubation}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {formatDate(lot.expectedReadyDate)}
                              {lot.isOverdue ? <Badge variant="destructive">Overdue</Badge> : lot.isReady ? <Badge>Ready</Badge> : null}
                            </div>
                          </TableCell>
                          <TableCell>{lot.blocksAvailable}</TableCell>
                          <TableCell className="max-w-xs truncate">{lot.notes || "—"}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>

                {!lotsWithTiming.filter((lot) => Number(lot.blocksAvailable) > 0 && lot.effectiveStatus !== "closed" && lot.effectiveStatus !== "moved").length && (
                  <p className="mt-4 text-sm text-slate-500">No incubation lots yet.</p>
                )}
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
                      <Select value={moveForm.lotId} onValueChange={(value) => setMoveForm((prev) => ({ ...prev, lotId: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a lot" />
                        </SelectTrigger>
                        <SelectContent>
                          {fruitingEligibleLots.map((lot) => (
                            <SelectItem key={lot.id} value={String(lot.id)}>
                              {lot.lotCode} · {lot.blocksAvailable} blocks
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Moved date</Label>
                      <Input type="date" value={moveForm.movedDate} onChange={(e) => setMoveForm((prev) => ({ ...prev, movedDate: e.target.value }))} />
                    </div>

                    <div>
                      <Label>Blocks moved</Label>
                      <Input type="number" min="1" value={moveForm.blocksMoved} onChange={(e) => setMoveForm((prev) => ({ ...prev, blocksMoved: e.target.value }))} />
                    </div>

                    <div>
                      <Label>Notes</Label>
                      <Textarea rows={3} value={moveForm.notes} onChange={(e) => setMoveForm((prev) => ({ ...prev, notes: e.target.value }))} />
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
                        <TableHead>Actions</TableHead>
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
                          <TableCell>
                            <Button type="button" variant="outline" size="sm" onClick={() => handleDeleteMove(move.id)} className="rounded-xl">
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </Button>
                          </TableCell>
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
                      <Label>Lot</Label>
                      <Select value={harvestForm.lotId} onValueChange={(value) => setHarvestForm((prev) => ({ ...prev, lotId: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select harvested lot" />
                        </SelectTrigger>
                        <SelectContent>
                          {harvestEligibleLots.map((lot) => (
                            <SelectItem key={lot.id} value={String(lot.id)}>
                              {lot.lotCode}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Harvest date</Label>
                      <Input type="date" value={harvestForm.harvestDate} onChange={(e) => setHarvestForm((prev) => ({ ...prev, harvestDate: e.target.value }))} />
                    </div>

                    <div>
                      <Label>Quantity harvested (kg)</Label>
                      <Input type="number" min="0.01" step="0.01" value={harvestForm.quantityKg} onChange={(e) => setHarvestForm((prev) => ({ ...prev, quantityKg: e.target.value }))} />
                    </div>

                    <div>
                      <Label>Notes</Label>
                      <Textarea rows={3} value={harvestForm.notes} onChange={(e) => setHarvestForm((prev) => ({ ...prev, notes: e.target.value }))} />
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
                      <Label>Lot</Label>
                      <Select value={lossForm.lotId} onValueChange={(value) => setLossForm((prev) => ({ ...prev, lotId: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select lot" />
                        </SelectTrigger>
                        <SelectContent>
                          {lossEligibleLots.map((lot) => (
                            <SelectItem key={lot.id} value={String(lot.id)}>
                              {lot.lotCode}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Loss date</Label>
                        <Input type="date" value={lossForm.lossDate} onChange={(e) => setLossForm((prev) => ({ ...prev, lossDate: e.target.value }))} />
                      </div>
                      <div>
                        <Label>Blocks lost</Label>
                        <Input type="number" min="1" value={lossForm.blocksLost} onChange={(e) => setLossForm((prev) => ({ ...prev, blocksLost: e.target.value }))} />
                      </div>
                    </div>

                    <div>
                      <Label>Reason</Label>
                      <Select value={lossForm.reason} onValueChange={(value) => setLossForm((prev) => ({ ...prev, reason: value }))}>
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
                      <Textarea rows={3} value={lossForm.notes} onChange={(e) => setLossForm((prev) => ({ ...prev, notes: e.target.value }))} />
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
                          <TableHead>kg</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {harvests.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell className="font-medium">{entry.lotCode}</TableCell>
                            <TableCell>{formatDate(entry.harvestDate)}</TableCell>
                            <TableCell>{entry.species}</TableCell>
                            <TableCell>{entry.quantityKg}</TableCell>
                            <TableCell>
                              <Button type="button" variant="outline" size="sm" onClick={() => handleDeleteHarvest(entry.id)} className="rounded-xl">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    {!harvests.length && <p className="mt-4 text-sm text-slate-500">No harvest entries yet.</p>}
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
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {losses.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell className="font-medium">{entry.lotCode}</TableCell>
                            <TableCell>{formatDate(entry.lossDate)}</TableCell>
                            <TableCell>{entry.reason}</TableCell>
                            <TableCell>{entry.blocksLost}</TableCell>
                            <TableCell>
                              <Button type="button" variant="outline" size="sm" onClick={() => handleDeleteLoss(entry.id)} className="rounded-xl">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    {!losses.length && <p className="mt-4 text-sm text-slate-500">No loss entries yet.</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports" className="mt-6 space-y-6">
            <Card className="rounded-3xl shadow-sm">
              <CardHeader>
                <CardTitle>Yield by lot</CardTitle>
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
                      <TableRow key={String(row.lotId)}>
                        <TableCell className="font-medium">{row.lotCode}</TableCell>
                        <TableCell>{row.species}</TableCell>
                        <TableCell>{row.blocks}</TableCell>
                        <TableCell>{row.totalHarvest.toFixed(2)} kg</TableCell>
                        <TableCell>{row.yieldPerBlock.toFixed(2)} kg</TableCell>
                        <TableCell>{row.lotLosses}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{row.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {!lotAnalytics.length && <p className="mt-4 text-sm text-slate-500">No lot analytics yet.</p>}
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="rounded-3xl shadow-sm">
                <CardHeader>
                  <CardTitle>Data health</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-slate-600">
                  <div className="rounded-2xl bg-slate-100 p-4">Spawn batches: <span className="font-medium text-slate-900">{spawnInventory.length}</span></div>
                  <div className="rounded-2xl bg-slate-100 p-4">Production lots: <span className="font-medium text-slate-900">{lots.length}</span></div>
                  <div className="rounded-2xl bg-slate-100 p-4">Fruiting moves: <span className="font-medium text-slate-900">{moves.length}</span></div>
                  <div className="rounded-2xl bg-slate-100 p-4">Harvest entries: <span className="font-medium text-slate-900">{harvests.length}</span></div>
                  <div className="rounded-2xl bg-slate-100 p-4">Loss entries: <span className="font-medium text-slate-900">{losses.length}</span></div>
                </CardContent>
              </Card>

              <Card className="rounded-3xl shadow-sm">
                <CardHeader>
                  <CardTitle>Notes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-slate-600">
                  <div className="rounded-2xl border p-4">Delete protections prevent removing spawn tied to lots, lots tied to downstream history, and moves tied to harvests.</div>
                  <div className="rounded-2xl border p-4">Date handling was rewritten to use local dates instead of UTC ISO slicing.</div>
                  <div className="rounded-2xl border p-4">After each write action, the app reloads from Supabase so UI state stays consistent across devices.</div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {isLoadingData && (
          <div className="mt-6 text-sm text-slate-500">Loading data from Supabase...</div>
        )}
      </div>
    </div>
  );
}
