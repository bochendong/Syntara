;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p2-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)
(require 2htdp/image)

(@assignment exams/2020w1-f/f-p2)

(@cwl ???)   ;fill in your CWL here (same CWL you put for 110 problem sets)

(@problem 1) ;do not edit or delete this tag
(@problem 2) ;do not edit or delete this tag

;;
;; Design a function called longest-sequence that consumes a list of integers
;; and produces the longest sequence of consective integers that are each one
;; larger than the previous integer.  All of the following are examples of
;; sequences of consecutive integers:
;;
;;     (list 1 2 3 4)
;;     (list 2)
;;     empty
;;     (list -5 -4)
;;
;; Your solution MUST BE TAIL-RECURSIVE.
;; 
;; If there are multiple sequences of the same length in the input list, then
;; you must produce the first one (the left-most one) in the list.
;;
;; For example:
;;  (longest-sequence  (list 8 9 1 8 6 7))     must produce (list 8 9)
;;  (longest-sequence (list 8 7 8 -3 -2 -1 5)) must produce (list -3 -2 -1)
;;
;; You MAY want to call length, and if so that is fine, but it is not required.
;; You MAY also want to handle the empty list case in the trampoline.
;;
;; You must include all relevant design recipe elements.
;;
;; As always, a file that does not run or that produces errors when run will
;; lose a significant number of marks.  A file with failing tests is much
;; less bad.  Run your work often, so that you can check and fix errors as
;; soon as they creep in.  Also be sure to run every time before you submit.
;;

(@htdf longest-sequence)
(@signature (listof Integer) -> (listof Integer))
;; produce the longest consecutive sequence in lon0

(check-expect (longest-sequence (list)) (list))
(check-expect (longest-sequence (list 9)) (list 9))
(check-expect (longest-sequence (list 3 4)) (list 3 4))
(check-expect (longest-sequence (list 4 3)) (list 4))
(check-expect (longest-sequence (list 8 9 1 8 6 7)) (list 8 9))
(check-expect (longest-sequence (list 1 2 3 4 5 6 7)) (list 1 2 3 4 5 6 7))
(check-expect (longest-sequence (list 8 9 1 8 6 7 8)) (list 6 7 8))
(check-expect (longest-sequence (list 6 7 8 8 9 1 8)) (list 6 7 8))
(check-expect (longest-sequence (list 8 7 8 -3 -2 -1 5)) (list -3 -2 -1))
(check-expect (longest-sequence (list 7 5 3 -1)) (list 7))

(@template-origin (listof Integer) accumulator)

(define (longest-sequence lon0)
  ;; curr is (listof Integer);reverse of sequence in lon0 ending just before lon
  ;; rsf is (listof Integer) ;reverse of longest sequence found so far
  ;; CONSTRAINT: curr will never be empty
  (local [(define (fn-for-lon lon curr rsf)
            (cond [(empty? lon) (reverse rsf)]
                  [else
                   (local [(define f (first lon))
                           (define prev (first curr))
                           (define ncurr (cons f curr))] ;might not get used
                     (if (= (add1 prev) f)
                         (fn-for-lon (rest lon) ncurr (longer-of ncurr rsf))
                         (fn-for-lon (rest lon)
                                     (list f)
                                     rsf)))]))
          (define (longer-of l1 l2)
            (if (> (length l1) (length l2)) l1 l2))]
    
	 (if (empty? lon0)
	     empty
	     (fn-for-lon (rest lon0) (list (first lon0)) (list (first lon0))))))
