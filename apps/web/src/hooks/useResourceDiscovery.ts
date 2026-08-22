import { useCallback, useEffect, useState } from "react";
import {
  DISPLAYABLE_RESOURCE_TYPES,
  type DiscoveredResource,
} from "../lib/resource-discovery";
import { supabase } from "../lib/supabase";

interface ResourceRow {
  id: string;
  subject_id: string;
  name: string;
  publisher: string | null;
  resource_type: string;
  status: string;
}

export function useResourceDiscovery() {
  const [resources, setResources] = useState<DiscoveredResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!auth.user) {
        setResources([]);
        setError(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("exam_profiles")
        .select("id")
        .eq("user_id", auth.user.id)
        .eq("status", "active")
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile) {
        setResources([]);
        setError(false);
        return;
      }

      const { data, error: resourcesError } = await supabase
        .from("resources")
        .select("id,subject_id,name,publisher,resource_type,status")
        .eq("user_id", auth.user.id)
        .eq("exam_profile_id", profile.id)
        .eq("status", "active")
        .in("resource_type", [...DISPLAYABLE_RESOURCE_TYPES])
        .order("created_at", { ascending: true });
      if (resourcesError) throw resourcesError;

      setResources(((data ?? []) as ResourceRow[]).map((resource) => ({
        resourceId: resource.id,
        subjectId: resource.subject_id,
        resourceName: resource.name,
        publisher: resource.publisher,
        resourceType: resource.resource_type,
        status: resource.status,
      })));
      setError(false);
    } catch (caught) {
      console.error("RESOURCE_DISCOVERY_FAILED", caught);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return { resources, loading, error, retry: load };
}
