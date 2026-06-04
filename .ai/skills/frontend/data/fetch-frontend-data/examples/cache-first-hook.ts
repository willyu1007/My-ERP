// Example: Cache-first query hook (TypeScript, query-library-agnostic intent)
//
// Goal: reuse list/grid cache to avoid a second network request for details.

type Post = { id: number; title: string };

// Pseudocode interfaces (replace with your query library)
type QueryClient = { getQueryData: <T>(key: unknown[]) => T | undefined };
type UseQueryOptions<T> = { queryKey: unknown[]; queryFn: () => Promise<T>; staleTime?: number };
declare function useQuery<T>(opts: UseQueryOptions<T>): { data: T };

export function usePostDetails(queryClient: QueryClient, blogId: number, postId: number) {
  return useQuery<Post>({
    queryKey: ['post', blogId, postId],
    queryFn: async () => {
      const cachedList = queryClient.getQueryData<{ rows: Post[] }>(['posts', blogId, 'list']);
      const cached = cachedList?.rows?.find(r => r.id === postId);
      if (cached) return cached;

      // Fallback: fetch from API
      return fetch(`/api/blogs/${blogId}/posts/${postId}`).then(r => r.json());
    },
    staleTime: 5 * 60 * 1000,
  }).data;
}
