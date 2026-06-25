'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CalendarClock,
  Database,
  Loader2,
  RefreshCw,
  Search,
  Store,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from '@/lib/notifications/client-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { backendJson } from '@/lib/utils/backend-api';
import { cn } from '@/lib/utils';

type AdminCourseRow = {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  purpose: string;
  university: string | null;
  courseCode: string | null;
  avatarUrl: string | null;
  listedInCourseStore: boolean;
  coursePriceCents: number;
  storePublishedAt: string | null;
  sourceCourseId: string | null;
  notebookCount: number;
  sceneCount: number;
  problemCount: number;
  publishedProblemCount: number;
  speechReadyCount: number;
  speechTotalCount: number;
  createdAt: string;
  updatedAt: string;
  owner: {
    id: string;
    email: string | null;
    name: string | null;
  };
  counts: {
    notebooks: number;
    notebookPages: number;
    markdownSections: number;
    problems: number;
    enrollments: number;
    sourcePurchases: number;
    reviews: number;
    conversations: number;
    studyMemories: number;
  };
};

type AdminCoursesResponse = {
  success: true;
  totalCount: number;
  courses: AdminCourseRow[];
};

type DeleteCourseResponse = {
  success: true;
  deletedCourse: {
    id: string;
    name: string;
    owner: {
      id: string;
      email: string | null;
      name: string | null;
    };
  };
};

function formatDateTime(date: string | null) {
  if (!date) return '未记录';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMoney(cents: number) {
  if (!cents) return '免费';
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CAD',
  }).format(cents / 100);
}

function ownerLabel(course: AdminCourseRow) {
  return course.owner.email || course.owner.name || course.owner.id;
}

function purposeLabel(purpose: string) {
  switch (purpose) {
    case 'research':
      return '科研';
    case 'university':
      return '大学课程';
    case 'daily':
      return '日常学习';
    default:
      return purpose;
  }
}

export function AdminCoursesSection() {
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [courses, setCourses] = useState<AdminCourseRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [courseToDelete, setCourseToDelete] = useState<AdminCourseRow | null>(null);
  const [confirmCourseName, setConfirmCourseName] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);

  const listedCount = useMemo(
    () => courses.filter((course) => course.listedInCourseStore).length,
    [courses],
  );
  const enrolledCount = useMemo(
    () => courses.reduce((sum, course) => sum + course.counts.enrollments, 0),
    [courses],
  );
  const problemCount = useMemo(
    () => courses.reduce((sum, course) => sum + course.counts.problems, 0),
    [courses],
  );

  const loadCourses = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ take: '120' });
    const normalizedQuery = appliedQuery.trim();
    if (normalizedQuery) params.set('query', normalizedQuery);

    try {
      const response = await backendJson<AdminCoursesResponse>(
        `/api/admin/courses?${params.toString()}`,
      );
      setCourses(response.courses);
      setTotalCount(response.totalCount);
    } catch (loadError) {
      setCourses([]);
      setTotalCount(0);
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [appliedQuery]);

  useEffect(() => {
    void loadCourses();
  }, [loadCourses, refreshTick]);

  const handleSearch = () => {
    setAppliedQuery(query.trim());
  };

  const openDeleteDialog = (course: AdminCourseRow) => {
    setCourseToDelete(course);
    setConfirmCourseName('');
  };

  const handleDelete = async () => {
    const course = courseToDelete;
    if (!course) return;

    if (confirmCourseName.trim() !== course.name) {
      toast.error('课程名不匹配，已取消删除');
      return;
    }

    setDeletingId(course.id);
    try {
      const response = await backendJson<DeleteCourseResponse>(
        `/api/admin/courses/${encodeURIComponent(course.id)}`,
        {
          method: 'DELETE',
        },
      );
      setCourses((current) => current.filter((item) => item.id !== course.id));
      setTotalCount((current) => Math.max(0, current - 1));
      setCourseToDelete(null);
      setConfirmCourseName('');
      toast.success(`已删除课程：${response.deletedCourse.name}`);
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : String(deleteError));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            全站课程管理
          </CardTitle>
          <CardDescription>浏览所有账户创建或克隆的课程，必要时由管理员直接删除。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border bg-background/70 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Database className="h-3.5 w-3.5" />
                当前结果
              </div>
              <div className="mt-1 text-2xl font-semibold">{courses.length}</div>
              <p className="text-xs text-muted-foreground">匹配总数 {totalCount}</p>
            </div>
            <div className="rounded-lg border bg-background/70 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Store className="h-3.5 w-3.5" />
                商城上架
              </div>
              <div className="mt-1 text-2xl font-semibold">{listedCount}</div>
              <p className="text-xs text-muted-foreground">当前结果内</p>
            </div>
            <div className="rounded-lg border bg-background/70 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                报名记录
              </div>
              <div className="mt-1 text-2xl font-semibold">{enrolledCount}</div>
              <p className="text-xs text-muted-foreground">当前结果内</p>
            </div>
            <div className="rounded-lg border bg-background/70 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <BookOpen className="h-3.5 w-3.5" />
                题目
              </div>
              <div className="mt-1 text-2xl font-semibold">{problemCount}</div>
              <p className="text-xs text-muted-foreground">当前结果内</p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSearch();
                }}
                placeholder="搜索课程名、课程代码、学校、owner 邮箱"
                className="pl-9"
              />
            </div>
            <Button type="button" variant="outline" onClick={handleSearch}>
              <Search className="mr-1 h-4 w-4" />
              搜索
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRefreshTick((current) => current + 1)}
              disabled={loading}
            >
              <RefreshCw className={cn('mr-1 h-4 w-4', loading ? 'animate-spin' : '')} />
              刷新
            </Button>
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>读取失败</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="overflow-hidden rounded-lg border bg-background/80">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">课程</th>
                    <th className="px-4 py-3 font-medium">Owner</th>
                    <th className="px-4 py-3 font-medium">状态</th>
                    <th className="px-4 py-3 font-medium">内容</th>
                    <th className="px-4 py-3 font-medium">活跃时间</th>
                    <th className="px-4 py-3 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                        正在读取课程...
                      </td>
                    </tr>
                  ) : courses.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                        没有找到课程
                      </td>
                    </tr>
                  ) : (
                    courses.map((course) => (
                      <tr key={course.id} className="border-b last:border-0">
                        <td className="max-w-[320px] px-4 py-4 align-top">
                          <div className="flex items-start gap-3">
                            {course.avatarUrl ? (
                              <img
                                src={course.avatarUrl}
                                alt=""
                                className="h-10 w-10 rounded-lg border object-cover"
                              />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                                <BookOpen className="h-4 w-4" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="truncate font-medium text-foreground">
                                {course.name}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {course.courseCode ? (
                                  <Badge variant="outline">{course.courseCode}</Badge>
                                ) : null}
                                <Badge variant="secondary">{purposeLabel(course.purpose)}</Badge>
                                {course.sourceCourseId ? (
                                  <Badge variant="outline">克隆课程</Badge>
                                ) : null}
                              </div>
                              {course.university || course.description ? (
                                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                                  {course.university ? `${course.university} · ` : ''}
                                  {course.description || '无描述'}
                                </p>
                              ) : null}
                              <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                                {course.id}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="max-w-[220px] px-4 py-4 align-top">
                          <div className="truncate font-medium">{ownerLabel(course)}</div>
                          <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                            {course.ownerId}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="flex flex-col items-start gap-2">
                            <Badge
                              variant={course.listedInCourseStore ? 'default' : 'outline'}
                              className={course.listedInCourseStore ? 'bg-emerald-600' : ''}
                            >
                              {course.listedInCourseStore ? '商城上架' : '未上架'}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatMoney(course.coursePriceCents)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                            <span>笔记 {course.counts.notebooks}</span>
                            <span>页面 {course.counts.notebookPages}</span>
                            <span>题目 {course.counts.problems}</span>
                            <span>报名 {course.counts.enrollments}</span>
                            <span>购买 {course.counts.sourcePurchases}</span>
                            <span>记忆 {course.counts.studyMemories}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <CalendarClock className="h-3.5 w-3.5" />
                            更新 {formatDateTime(course.updatedAt)}
                          </div>
                          <div className="mt-1">创建 {formatDateTime(course.createdAt)}</div>
                          {course.storePublishedAt ? (
                            <div className="mt-1">
                              上架 {formatDateTime(course.storePublishedAt)}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-4 text-right align-top">
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => openDeleteDialog(course)}
                            disabled={deletingId === course.id}
                          >
                            {deletingId === course.id ? (
                              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="mr-1 h-4 w-4" />
                            )}
                            删除
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={Boolean(courseToDelete)}
        onOpenChange={(open) => {
          if (open) return;
          if (deletingId) return;
          setCourseToDelete(null);
          setConfirmCourseName('');
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除课程？</AlertDialogTitle>
            <AlertDialogDescription>
              管理员删除会移除课程记录、报名、购买记录、题库和课程记忆，并让关联笔记脱离课程。这个操作不能撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>

          {courseToDelete ? (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <div className="font-medium text-foreground">{courseToDelete.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Owner: {ownerLabel(courseToDelete)}
                </div>
                <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                  {courseToDelete.id}
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="admin-course-delete-confirm" className="text-sm font-medium">
                  输入完整课程名确认删除
                </label>
                <Input
                  id="admin-course-delete-confirm"
                  value={confirmCourseName}
                  onChange={(event) => setConfirmCourseName(event.target.value)}
                  placeholder={courseToDelete.name}
                  autoFocus
                />
              </div>
            </div>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingId)}>取消</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={
                !courseToDelete ||
                confirmCourseName.trim() !== courseToDelete.name ||
                Boolean(deletingId)
              }
            >
              {deletingId ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-4 w-4" />
              )}
              确认删除
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
