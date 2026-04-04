import React, { useEffect, useMemo, useState } from "react";
import type {
  AppRole,
  Branch,
  UpdateAdminUserRequest,
  User,
  UserStatus,
} from "@flcbi/contracts";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryErrorState } from "@/components/shared/QueryErrorState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useAuth } from "@/contexts/AuthContext";
import {
  useAdminBranches,
  useAdminRoles,
  useAdminUsers,
  useCreateAdminUser,
  useDeleteAdminUser,
  useUpdateAdminUser,
} from "@/hooks/api/use-platform";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pencil, Shield, UserPlus, UserX } from "lucide-react";

type UserDraft = {
  email: string;
  name: string;
  role: AppRole;
  branchId: string;
  password: string;
  status: UserStatus;
};

const USER_STATUSES: UserStatus[] = ["active", "pending", "disabled"];

function createEmptyDraft(defaultRole: AppRole): UserDraft {
  return {
    email: "",
    name: "",
    role: defaultRole,
    branchId: "",
    password: "",
    status: "active",
  };
}

function getRoleLabel(role: string) {
  return role.replace(/_/g, " ");
}

function UserForm({
  draft,
  branches,
  roleOptions,
  mode,
  disabled,
  onChange,
}: {
  draft: UserDraft;
  branches: Branch[];
  roleOptions: Array<{ role: AppRole; description: string }>;
  mode: "create" | "edit";
  disabled: boolean;
  onChange: (patch: Partial<UserDraft>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="user-name">Display name</Label>
          <Input
            id="user-name"
            value={draft.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="Full name"
            disabled={disabled}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="user-email">Email</Label>
          <Input
            id="user-email"
            type="email"
            value={draft.email}
            onChange={(event) => onChange({ email: event.target.value })}
            placeholder="name@company.com"
            disabled={disabled}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="user-role">Role</Label>
          <select
            id="user-role"
            value={draft.role}
            onChange={(event) => onChange({ role: event.target.value as AppRole })}
            disabled={disabled}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {roleOptions.map((role) => (
              <option key={role.role} value={role.role}>
                {getRoleLabel(role.role)}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {roleOptions.find((role) => role.role === draft.role)?.description ?? "Role-based access for this user."}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="user-branch">Scope</Label>
          <select
            id="user-branch"
            value={draft.branchId}
            onChange={(event) => onChange({ branchId: event.target.value })}
            disabled={disabled}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Company-wide access</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.code} - {branch.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Leave company-wide for cross-branch users. Choose a branch for a restricted operator.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="user-status">Status</Label>
          <select
            id="user-status"
            value={draft.status}
            onChange={(event) => onChange({ status: event.target.value as UserStatus })}
            disabled={disabled}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {USER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {getRoleLabel(status)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="user-password">
          {mode === "create" ? "Temporary password" : "Reset password"}
        </Label>
        <Input
          id="user-password"
          type="password"
          value={draft.password}
          onChange={(event) => onChange({ password: event.target.value })}
          placeholder={mode === "create" ? "Minimum 8 characters" : "Leave blank to keep current password"}
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">
          {mode === "create"
            ? "This password will be used for the user's first sign-in."
            : "If you enter a new password here, the old one will stop working immediately."}
        </p>
      </div>
    </div>
  );
}

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const usersQuery = useAdminUsers();
  const rolesQuery = useAdminRoles();
  const branchesQuery = useAdminBranches();
  const createUser = useCreateAdminUser();
  const updateUser = useUpdateAdminUser();
  const deleteUser = useDeleteAdminUser();

  const users = useMemo(() => usersQuery.data?.items ?? [], [usersQuery.data?.items]);
  const branches = useMemo(() => branchesQuery.data?.items ?? [], [branchesQuery.data?.items]);
  const roles = useMemo(
    () => (rolesQuery.data?.items ?? []).map((item) => ({
      role: item.role as AppRole,
      description: item.description,
    })),
    [rolesQuery.data?.items],
  );
  const defaultRole = roles[0]?.role ?? "manager";
  const branchById = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch])),
    [branches],
  );

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [draft, setDraft] = useState<UserDraft>(() => createEmptyDraft(defaultRole));

  useEffect(() => {
    if (!editingUser) {
      setDraft((current) => current.role === defaultRole ? current : createEmptyDraft(defaultRole));
    }
  }, [defaultRole, editingUser]);

  const isLoading = usersQuery.isLoading || rolesQuery.isLoading || branchesQuery.isLoading;
  const isError = usersQuery.isError || rolesQuery.isError || branchesQuery.isError;
  const error = usersQuery.error ?? rolesQuery.error ?? branchesQuery.error;

  const updateDraft = (patch: Partial<UserDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const resetDraft = () => {
    setDraft(createEmptyDraft(defaultRole));
  };

  const openCreate = () => {
    resetDraft();
    setEditingUser(null);
    setIsCreateOpen(true);
  };

  const openEdit = (targetUser: User) => {
    setEditingUser(targetUser);
    setDraft({
      email: targetUser.email,
      name: targetUser.name,
      role: targetUser.role,
      branchId: targetUser.branchId ?? "",
      password: "",
      status: targetUser.status ?? "active",
    });
  };

  const validateDraft = (mode: "create" | "edit") => {
    if (!draft.name.trim()) {
      throw new Error("Display name is required");
    }
    if (!draft.email.trim()) {
      throw new Error("Email is required");
    }
    if (mode === "create" && draft.password.trim().length < 8) {
      throw new Error("Temporary password must be at least 8 characters");
    }
    if (mode === "edit" && draft.password && draft.password.trim().length < 8) {
      throw new Error("Reset password must be at least 8 characters");
    }
  };

  const handleCreate = async () => {
    try {
      validateDraft("create");
      await createUser.mutateAsync({
        email: draft.email.trim(),
        name: draft.name.trim(),
        role: draft.role,
        branchId: draft.branchId || null,
        password: draft.password,
        status: draft.status,
      });
      toast.success("User created");
      setIsCreateOpen(false);
      resetDraft();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create user");
    }
  };

  const handleUpdate = async () => {
    if (!editingUser) return;

    try {
      validateDraft("edit");
      const payload: UpdateAdminUserRequest = {
        email: draft.email.trim(),
        name: draft.name.trim(),
        role: draft.role,
        branchId: draft.branchId || null,
        status: draft.status,
      };
      if (draft.password.trim()) {
        payload.password = draft.password.trim();
      }

      await updateUser.mutateAsync({
        id: editingUser.id,
        input: payload,
      });
      toast.success("User updated");
      setEditingUser(null);
      resetDraft();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update user");
    }
  };

  const handleDeactivate = async () => {
    if (!deletingUser) return;

    try {
      await deleteUser.mutateAsync(deletingUser.id);
      toast.success("User deactivated");
      setDeletingUser(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not deactivate user");
    }
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading users...</div>;
  }

  if (isError) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="Users & Roles"
          description="Create, update, and deactivate tenant users"
          breadcrumbs={[{ label: "FLC BI" }, { label: "Admin" }, { label: "Users & Roles" }]}
        />
        <QueryErrorState
          title="Could not load user management"
          error={error}
          onRetry={() => {
            void usersQuery.refetch();
            void rolesQuery.refetch();
            void branchesQuery.refetch();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Users & Roles"
        description="Create, update, and deactivate tenant users"
        breadcrumbs={[{ label: "FLC BI" }, { label: "Admin" }, { label: "Users & Roles" }]}
        actions={
          <Button onClick={openCreate}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        }
      />

      <div className="glass-panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-left">
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Email</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Role</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Scope</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No users have been provisioned for this company yet.
                </td>
              </tr>
            )}
            {users.map((listedUser) => {
              const branch = listedUser.branchId ? branchById.get(listedUser.branchId) : undefined;
              const isCurrentUser = listedUser.id === currentUser?.id;

              return (
                <tr key={listedUser.id} className="data-table-row">
                  <td className="px-4 py-3 text-foreground">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15">
                        <span className="text-xs font-semibold text-primary">{listedUser.name.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="font-medium">{listedUser.name}</p>
                        {isCurrentUser && <p className="text-[11px] text-muted-foreground">Current session</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{listedUser.email}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 capitalize text-foreground">
                      <Shield className="h-3 w-3 text-primary" />
                      {getRoleLabel(listedUser.role)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    {branch ? `${branch.code} - ${branch.name}` : "Company-wide"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={listedUser.status ?? "active"} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(listedUser)}>
                        <Pencil className="mr-2 h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isCurrentUser || listedUser.status === "disabled"}
                        onClick={() => setDeletingUser(listedUser)}
                      >
                        <UserX className="mr-2 h-3.5 w-3.5" />
                        {listedUser.status === "disabled" ? "Disabled" : "Deactivate"}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) resetDraft();
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
            <DialogDescription>
              Provision a Supabase-backed user account for this company.
            </DialogDescription>
          </DialogHeader>
          <UserForm
            draft={draft}
            branches={branches}
            roleOptions={roles}
            mode="create"
            disabled={createUser.isPending}
            onChange={updateDraft}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)} disabled={createUser.isPending}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreate()} disabled={createUser.isPending}>
              {createUser.isPending ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingUser)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingUser(null);
            resetDraft();
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update profile, role, scope, status, or password.
            </DialogDescription>
          </DialogHeader>
          <UserForm
            draft={draft}
            branches={branches}
            roleOptions={roles}
            mode="edit"
            disabled={updateUser.isPending}
            onChange={updateDraft}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditingUser(null);
                resetDraft();
              }}
              disabled={updateUser.isPending}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleUpdate()} disabled={updateUser.isPending}>
              {updateUser.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deletingUser)} onOpenChange={(open) => !open && setDeletingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate user?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingUser
                ? `This will block ${deletingUser.email} from signing in, but it will keep their audit and import history intact.`
                : "This user will be blocked from signing in."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteUser.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleDeactivate();
              }}
              disabled={deleteUser.isPending}
            >
              {deleteUser.isPending ? "Deactivating..." : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
