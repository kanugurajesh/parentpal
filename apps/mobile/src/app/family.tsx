import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Share, View } from "react-native";
import { MAX_CAREGIVERS, MAX_PLAYBOOK_WINS, RELATION_LABELS, type Caregiver, type PlaybookResponse, type Relation } from "@parentpal/shared";
import { Icon } from "@/components/Icon";
import { timeAgo } from "@/components/PostCard";
import { SubHeader } from "@/components/SubHeader";
import { Button, Chip, ErrorNote, Field, IconButton, Loading, Screen, T } from "@/components/ui";
import { api } from "@/lib/api";
import { confirm } from "@/lib/confirm";
import { color, radius, space } from "@/theme/tokens";

const RELATIONS = Object.keys(RELATION_LABELS) as Relation[];

const reshareText = (c: Caregiver, child: string) =>
  `Hi ${c.name}! Here's what we're trying with ${child} at the moment, with the exact words we're using. You can tell me how it went right on the page, no app needed:\n${c.url}`;

function CaregiverRow({ c, child, onRemove }: { c: Caregiver; child: string; onRemove: () => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: color.card, borderRadius: radius.card, padding: space.lg, borderWidth: 1.5, borderColor: color.line }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: color.apricotTint, alignItems: "center", justifyContent: "center" }}>
        <T variant="bodyStrong">{c.name[0]?.toUpperCase()}</T>
      </View>
      <View style={{ flex: 1 }}>
        <T variant="bodyStrong">{c.name}</T>
        <T variant="small" color={color.inkMuted}>
          {RELATION_LABELS[c.relation]} · {c.lastOpenedAt ? `Opened ${timeAgo(c.lastOpenedAt)}` : "Not opened yet"}
          {c.notesCount ? ` · ${c.notesCount} note${c.notesCount === 1 ? "" : "s"}` : ""}
        </T>
      </View>
      <IconButton icon="share" label={`Send ${c.name} the link again`} onPress={() => Share.share({ message: reshareText(c, child) }).catch(() => {})} />
      <IconButton icon="trash" label={`Stop sharing with ${c.name}`} onPress={onRemove} />
    </View>
  );
}

/** Family Playbook: share the wins you're trying, and the exact words, with everyone who looks after your child. */
export default function Family() {
  const { addWin } = useLocalSearchParams<{ addWin?: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["playbook"], queryFn: api.playbook });
  const [name, setName] = useState("");
  const [relation, setRelation] = useState<Relation>("grandparent");
  const [error, setError] = useState<string | null>(null);

  const setData = (data: PlaybookResponse) => qc.setQueryData(["playbook"], data);
  const setWins = useMutation({ mutationFn: api.setPlaybookWins, onSuccess: setData, onError: (e) => setError((e as Error).message) });
  const add = useMutation({
    mutationFn: api.addCaregiver,
    onSuccess: async (res) => {
      setName("");
      setError(null);
      await qc.invalidateQueries({ queryKey: ["playbook"] });
      await Share.share({ message: res.shareText }).catch(() => {});
    },
    onError: (e) => setError((e as Error).message),
  });

  const data = q.data;
  const child = data?.childNickname ?? "your child";
  const shared = new Set(data?.wins.map((w) => w.id));

  // Arriving from a win's "Send to family": add that win once.
  const added = useRef(false);
  useEffect(() => {
    if (!data || !addWin || added.current) return;
    added.current = true;
    const ids = data.wins.map((w) => w.id);
    if (ids.includes(addWin) || !data.available.some((w) => w.id === addWin)) return;
    if (ids.length >= MAX_PLAYBOOK_WINS) return setError(`You can share up to ${MAX_PLAYBOOK_WINS} wins. Remove one to add this.`);
    setWins.mutate([...ids, addWin]);
  }, [addWin, data, setWins]);

  const toggle = (id: string) => {
    setError(null);
    const ids = data!.wins.map((w) => w.id);
    if (shared.has(id)) return setWins.mutate(ids.filter((x) => x !== id));
    if (ids.length >= MAX_PLAYBOOK_WINS) return setError(`You can share up to ${MAX_PLAYBOOK_WINS} wins at a time. Fewer is easier to stick to.`);
    setWins.mutate([...ids, id]);
  };

  const remove = async (c: Caregiver) => {
    const ok = await confirm({
      title: `Stop sharing with ${c.name}?`,
      message: "Their link will stop working. Notes they already sent stay in your Story.",
      confirmLabel: "Stop sharing",
      cancelLabel: "Cancel",
      tone: "danger",
      icon: "trash",
    });
    if (!ok) return;
    await api.revokeCaregiver(c.id);
    await qc.invalidateQueries({ queryKey: ["playbook"] });
  };

  return (
    <Screen>
      <SubHeader title="Family playbook" />
      {q.isLoading ? <Loading /> : null}
      {q.error ? <ErrorNote message={(q.error as Error).message} onRetry={() => q.refetch()} /> : null}
      {data ? (
        <View style={{ gap: space.xl }}>
          <View style={{ backgroundColor: color.mossTint, borderRadius: radius.card, padding: space.lg, gap: space.sm }}>
            <T variant="bodyStrong">Children learn faster when every adult responds the same way.</T>
            <T variant="small" color={color.inkSoft}>
              Send grandparents, the other parent, a nanny or a teacher a private link with what you're trying with {child} and the exact words to use. They don't need the app, and they can tell you how it went. Their notes appear in {child}'s Story and help spot patterns.
            </T>
          </View>

          <View style={{ gap: space.md }}>
            <T variant="h3" accessibilityRole="header">
              What you're sharing
            </T>
            {data.available.length ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                {data.available.map((w) => (
                  <Chip key={w.id} label={`${w.goalTitle}: ${w.title}`} selected={shared.has(w.id)} onPress={() => toggle(w.id)} />
                ))}
              </View>
            ) : (
              <View style={{ gap: space.sm }}>
                <T color={color.inkMuted}>Your goals don't have wins to share yet. Add a goal with a guide, like sleep or tantrums, and its wins can be shared here.</T>
                <Button label="Change goals" kind="secondary" onPress={() => router.push("/goals")} style={{ alignSelf: "flex-start" }} />
              </View>
            )}
            {data.available.length > 0 && !data.wins.length ? (
              <T variant="small" color={color.inkMuted}>
                Tap a win to share it.
              </T>
            ) : null}
            {data.wins.map((w) => (
              <View key={w.id} style={{ borderLeftWidth: 4, borderColor: color.apricot, backgroundColor: color.apricotTint, borderRadius: radius.inner, padding: space.md, gap: 2 }}>
                <T variant="smallStrong" color="#8A4B12">
                  {w.title}: say this
                </T>
                <T>{w.script}</T>
              </View>
            ))}
          </View>

          <View style={{ gap: space.md }}>
            <T variant="h3" accessibilityRole="header">
              Shared with
            </T>
            {data.caregivers.length ? (
              data.caregivers.map((c) => <CaregiverRow key={c.id} c={c} child={child} onRemove={() => void remove(c)} />)
            ) : (
              <T color={color.inkMuted}>Nobody yet. Add the first person below.</T>
            )}
          </View>

          {data.caregivers.length < MAX_CAREGIVERS ? (
            <View style={{ gap: space.lg, backgroundColor: color.card, borderRadius: radius.card, padding: space.lg, borderWidth: 1.5, borderColor: color.line }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <Icon name="plus" size={20} color={color.moss} />
                <T variant="bodyStrong">Add someone</T>
              </View>
              <Field label="What does your child call them?" placeholder="e.g. Nani, Papa, Aunty Meena" value={name} onChangeText={setName} maxLength={30} />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                {RELATIONS.map((r) => (
                  <Chip key={r} label={RELATION_LABELS[r]} selected={relation === r} onPress={() => setRelation(r)} />
                ))}
              </View>
              <Button
                label="Create link and share"
                icon="share"
                disabled={!name.trim() || !data.wins.length}
                loading={add.isPending}
                onPress={() => add.mutate({ name: name.trim(), relation })}
              />
              {!data.wins.length ? (
                <T variant="small" color={color.inkMuted}>
                  {data.available.length ? "Choose at least one win above to share." : "Change your goals above first, then choose what to share."}
                </T>
              ) : null}
              <T variant="tiny" color={color.inkMuted}>
                Anyone with the link can see the shared wins and send you notes, and nothing else. You can turn a link off at any time.
              </T>
            </View>
          ) : null}

          {error ? <ErrorNote message={error} /> : null}
        </View>
      ) : null}
    </Screen>
  );
}
