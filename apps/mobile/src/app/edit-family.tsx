import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { MAX_CHILDREN, type Child, type Me, type User } from "@parentpal/shared";
import { BirthDatePicker, type MonthYear } from "@/components/BirthDatePicker";
import { SubHeader } from "@/components/SubHeader";
import { Button, Chip, ErrorNote, Field, Loading, Screen, T } from "@/components/ui";
import { api } from "@/lib/api";
import { confirm } from "@/lib/confirm";
import { useSession } from "@/lib/session";
import { color, radius, space } from "@/theme/tokens";

/** A child being edited: `id` is set for saved children, missing for one added on this screen. */
interface ChildForm {
  id?: string;
  nickname: string;
  sex: Child["sex"] | null;
  birth: MonthYear | null;
}

const toForm = (c: Child): ChildForm => ({ id: c.id, nickname: c.nickname, sex: c.sex, birth: { month: c.birthMonth, year: c.birthYear } });
const complete = (c: ChildForm) => c.nickname.trim().length > 0 && !!c.sex && !!c.birth;
const changed = (c: ChildForm, saved: Child) =>
  c.nickname.trim() !== saved.nickname || c.sex !== saved.sex || c.birth?.month !== saved.birthMonth || c.birth?.year !== saved.birthYear;

/**
 * Edit the parent and children after onboarding: fix a nickname or birth date, add the second
 * child, or remove one. Edits are saved together; removing a child happens straight away, after
 * a warning, because it deletes their history.
 */
export default function EditFamily() {
  const { me } = useSession();
  if (!me) {
    return (
      <Screen>
        <SubHeader title="Family profile" />
        <Loading />
      </Screen>
    );
  }
  return <FamilyForm me={me} />;
}

/** Mounted once /me is loaded, so the form starts from it; later /me refreshes don't wipe what's typed. */
function FamilyForm({ me }: { me: Me }) {
  const qc = useQueryClient();
  const { refreshMe } = useSession();
  const [firstName, setFirstName] = useState(me.user.firstName ?? "");
  const [role, setRole] = useState<User["parentRole"]>(me.user.parentRole);
  const [kids, setKids] = useState<ChildForm[]>(() => me.children.map(toForm));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saved = new Map(me.children.map((c) => [c.id, c]));
  const userDirty = firstName.trim() !== (me.user.firstName ?? "") || role !== me.user.parentRole;
  const kidsDirty = kids.some((k) => !k.id || changed(k, saved.get(k.id)!));
  const valid = firstName.trim().length > 0 && !!role && kids.every(complete);

  const update = (i: number, patch: Partial<ChildForm>) => setKids((ks) => ks.map((k, j) => (j === i ? { ...k, ...patch } : k)));

  async function remove(i: number) {
    const kid = kids[i];
    if (!kid.id) {
      setKids((ks) => ks.filter((_, j) => j !== i));
      return;
    }
    const name = saved.get(kid.id)!.nickname;
    const ok = await confirm({
      title: `Remove ${name}?`,
      message: `This permanently deletes ${name}'s moments, patterns, progress and family playbook links. It can't be undone.`,
      confirmLabel: `Remove ${name}`,
      cancelLabel: "Keep",
      tone: "danger",
      icon: "trash",
    });
    if (!ok) return;
    setError(null);
    try {
      await api.deleteChild(kid.id);
      setKids((ks) => ks.filter((_, j) => j !== i));
      // Story, progress and the playbook all hang off the child.
      await qc.invalidateQueries();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (userDirty) await api.updateMe({ firstName: firstName.trim(), parentRole: role! });
      const next: ChildForm[] = [];
      for (const k of kids) {
        const body = { nickname: k.nickname.trim(), sex: k.sex!, birthMonth: k.birth!.month, birthYear: k.birth!.year };
        if (!k.id) next.push(toForm(await api.addChild(body)));
        else if (changed(k, saved.get(k.id)!)) next.push(toForm(await api.updateChild(k.id, body)));
        else next.push(k);
      }
      // Keep ids from children just created, so pressing Save again after an error doesn't add them twice.
      setKids(next);
      // A new age changes which content and wins apply, so refresh everything.
      await Promise.all([refreshMe(), qc.invalidateQueries()]);
      router.back();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Screen>
      <SubHeader title="Family profile" />
      <View style={{ gap: space.xl }}>
        <View style={{ gap: space.lg }}>
          <T variant="h3">You</T>
          <View style={{ gap: space.sm }}>
            <T variant="smallStrong" color={color.inkSoft}>
              {"I'm the child's"}
            </T>
            <View style={{ flexDirection: "row", gap: space.sm }} accessibilityRole="radiogroup">
              <Chip label="Mother" selected={role === "mother"} onPress={() => setRole("mother")} />
              <Chip label="Father" selected={role === "father"} onPress={() => setRole("father")} />
            </View>
          </View>
          <Field label="Your first name" value={firstName} onChangeText={setFirstName} autoCapitalize="words" maxLength={40} />
          {me.user.email ? (
            <T variant="small" color={color.inkMuted}>
              Signed in as {me.user.email}
            </T>
          ) : null}
        </View>

        {kids.map((k, i) => (
          <View key={k.id ?? `new-${i}`} style={{ gap: space.lg, borderTopWidth: 1.5, borderColor: color.line, paddingTop: space.xl }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <T variant="h3">{k.id ? saved.get(k.id)!.nickname : "New child"}</T>
              {/* The app needs at least one child to personalise advice. */}
              {kids.length > 1 ? <Button label={k.id ? "Remove" : "Cancel"} kind="ghost" onPress={() => remove(i)} /> : null}
            </View>
            <Field label="Nickname" placeholder="e.g. Mo" value={k.nickname} onChangeText={(nickname) => update(i, { nickname })} maxLength={30} autoCapitalize="words" />
            <View style={{ gap: space.sm }}>
              <T variant="smallStrong" color={color.inkSoft}>
                Your child is a
              </T>
              <View style={{ flexDirection: "row", gap: space.sm }} accessibilityRole="radiogroup">
                <Chip label="Girl" selected={k.sex === "girl"} onPress={() => update(i, { sex: "girl" })} />
                <Chip label="Boy" selected={k.sex === "boy"} onPress={() => update(i, { sex: "boy" })} />
              </View>
            </View>
            <BirthDatePicker label="Date of birth" value={k.birth} onChange={(birth) => update(i, { birth })} />
          </View>
        ))}

        {kids.length < MAX_CHILDREN ? (
          <View style={{ borderRadius: radius.card, borderWidth: 1.5, borderStyle: "dashed", borderColor: color.line, padding: space.lg, gap: space.sm }}>
            <T variant="small" color={color.inkSoft}>
              Got another little one? Add them to keep their moments separate.
            </T>
            <Button label="Add a child" kind="secondary" icon="plus" onPress={() => setKids((ks) => [...ks, { nickname: "", sex: null, birth: null }])} />
          </View>
        ) : null}

        <T variant="small" color={color.inkMuted}>
          We only keep the month and year each child was born, never the full date.
        </T>
        {error ? <ErrorNote message={error} /> : null}
        <Button label="Save changes" loading={busy} disabled={!valid || !(userDirty || kidsDirty)} onPress={save} />
      </View>
    </Screen>
  );
}
