interface CoursePublishCandidate {
  sourceCourseId?: string | null;
}

interface NotebookPublishCandidate {
  sourceNotebookId?: string | null;
}

export function courseContainsPurchasedNotebook(
  notebooks: readonly NotebookPublishCandidate[],
): boolean {
  return notebooks.some((notebook) => Boolean(notebook.sourceNotebookId?.trim()));
}

export function getCoursePublishBlockReason(
  course: CoursePublishCandidate | null | undefined,
  notebooks: readonly NotebookPublishCandidate[],
): string | null {
  return getCoursePublishBlockReasonFromFlags(course, courseContainsPurchasedNotebook(notebooks));
}

export function getCoursePublishBlockReasonFromFlags(
  course: CoursePublishCandidate | null | undefined,
  containsPurchasedNotebook: boolean,
): string | null {
  if (course?.sourceCourseId?.trim()) {
    return '旧版商城课程副本不能再次发布到商城';
  }
  if (containsPurchasedNotebook) {
    return '课程包含从商城购买的笔记本副本，不能发布到商城';
  }
  return null;
}

export function getPurchasedNotebookMoveWarning(targetCourseName?: string | null): string {
  const targetLabel = targetCourseName?.trim() ? `《${targetCourseName.trim()}》` : '目标课程';
  return `这本笔记本是从商城购买得到的副本。移动到${targetLabel}后，该课程将不能发布到商城。确定继续移动吗？`;
}

export function getPurchasedNotebookMoveSuccessMessage(targetCourseName?: string | null): string {
  const targetLabel = targetCourseName?.trim() ? `《${targetCourseName.trim()}》` : '目标课程';
  return `已移动到${targetLabel}；该课程后续将无法发布到商城`;
}
