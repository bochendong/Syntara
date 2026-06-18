;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname 2020w1-f-p1-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment exams/2020w1-f/f-p1)

(@cwl ???)   ;fill in your CWL here (same CWL you put for 110 problem sets)


(@problem 1) ;DO NOT EDIT OR DELETE THIS LINE!

#| 


This is a multiple choice problem on reference arrows.  It asks you to label
reference arrows and call arrows.


NOTE: This problem will be autograded, and ALL OF THE FOLLOWING ARE ESSENTIAL
      IN YOUR SOLUTION.  Failure to follow these requirements may result in
      receiving zero marks for this problem.

 - You MUST NOT EDIT the type comments.
 
 - You MUST NOT edit the code at the end of the file marked do not edit.
 
 - This file includes special check-expects at the bottom that will check
   whether your answer is well-formed when you run the file. If one or more
   answers are not well-formed the test will fail with a message that
   describes what needs to be fixed.
 
 - Run the file EVERY time you edit an answer.
 
 - Note that initially the tests WILL FAIL, because you need to edit your
   answers in for the tests to pass.
 
 - Your submission WILL BE GRADED IF THERE ARE FAILING TESTS.  A failing test
   just means that specific answer is not well-formed.
 
 - BUT your submission will not be graded if running it produces red errors.

Consider the following type comments and templates.  You will notice that every 
reference to a type name, is followed by a letter in square brackets, e.g. [A],
[B], etc. Similarly every function call is followed by a number in square 
brackets, e.g. [1], [2], etc. Those labels exist to give names to the reference
and call arrows that begin at those points. The reference arrows are named A-I,
the call arrows are named 1-9.


(define-struct blue (lab subs))
(define-struct green (lab l r))
;; Tree is one of:
;; - false
;; - Blue[A]
;; - Green[B]
;;
;; Label is String
;;
;; Blue is (make-blue Label[C] ListOfTree[D])
;;
;; Green is (make-green Label[E] Tree[F] Tree[G])
;;
;; ListOfTree is one of:
;; - empty
;; - (cons Tree[H] ListOfTree[I])


(define (fn-for-tree n)
  (cond [(false? n) (...)]
        [(blue? n) (fn-for-blue[1] n)]
        [else (fn-for-green[2] n)]))

(define (fn-for-label l)
  (... l))

(define (fn-for-blue b)
  (... (fn-for-label[3] (blue-lab b))
       (fn-for-lot[4]   (blue-subs b))))

(define (fn-for-green g)
  (... (fn-for-label[5] (green-lab g))
       (fn-for-tree[6]  (green-l g))
       (fn-for-tree[7]  (green-r g))))

(define (fn-for-lot lot)
  (cond [(empty? lot) (...)]
        [else
         (... (fn-for-tree[8] (first lot))
              (fn-for-lot[9] (rest lot)))]))


 In the ARROW constants below you must replace every "???" string with
 one of the following strings to indicate what kind of arrow the label
 marks:
    "R"    for reference
    "SR"   for self-reference
    "MR"   for mutual-reference
    "NH"   for natural helper
    "NR"   for natural recursion
    "NMR"  for natural mutual recursion

|#

(define ARROW-A "???")
(define ARROW-B "???")
(define ARROW-C "???")
(define ARROW-D "???")
(define ARROW-E "???")
(define ARROW-F "???")
(define ARROW-G "???")
(define ARROW-H "???")
(define ARROW-I "???")

(define ARROW-1 "???")
(define ARROW-2 "???")
(define ARROW-3 "???")
(define ARROW-4 "???")
(define ARROW-5 "???")
(define ARROW-6 "???")
(define ARROW-7 "???")
(define ARROW-8 "???")
(define ARROW-9 "???")



;;============================================================================
;;============================================================================
;;============================================================================
;; You should ignore this code.  Do not read or edit below here.
;;
;; This code is here so that running the file will verify that your answer is
;; well-formed.

(define (is-string-R-SR-MR-NH-NR-OR-NMR x)
  (member x '("R" "SR" "MR" "NH" "NR" "NMR")))

(define (is-string-yes-or-no x)
  (member x '("yes" "no")))


(check-satisfied ARROW-A is-string-R-SR-MR-NH-NR-OR-NMR)
(check-satisfied ARROW-B is-string-R-SR-MR-NH-NR-OR-NMR)
(check-satisfied ARROW-C is-string-R-SR-MR-NH-NR-OR-NMR)
(check-satisfied ARROW-D is-string-R-SR-MR-NH-NR-OR-NMR)
(check-satisfied ARROW-E is-string-R-SR-MR-NH-NR-OR-NMR)
(check-satisfied ARROW-F is-string-R-SR-MR-NH-NR-OR-NMR)
(check-satisfied ARROW-G is-string-R-SR-MR-NH-NR-OR-NMR)
(check-satisfied ARROW-H is-string-R-SR-MR-NH-NR-OR-NMR)
(check-satisfied ARROW-I is-string-R-SR-MR-NH-NR-OR-NMR)

(check-satisfied ARROW-1 is-string-R-SR-MR-NH-NR-OR-NMR)
(check-satisfied ARROW-2 is-string-R-SR-MR-NH-NR-OR-NMR)
(check-satisfied ARROW-3 is-string-R-SR-MR-NH-NR-OR-NMR)
(check-satisfied ARROW-4 is-string-R-SR-MR-NH-NR-OR-NMR)
(check-satisfied ARROW-5 is-string-R-SR-MR-NH-NR-OR-NMR)
(check-satisfied ARROW-6 is-string-R-SR-MR-NH-NR-OR-NMR)
(check-satisfied ARROW-7 is-string-R-SR-MR-NH-NR-OR-NMR)
(check-satisfied ARROW-8 is-string-R-SR-MR-NH-NR-OR-NMR)
(check-satisfied ARROW-9 is-string-R-SR-MR-NH-NR-OR-NMR)
