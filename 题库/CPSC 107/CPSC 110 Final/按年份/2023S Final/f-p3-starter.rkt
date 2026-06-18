;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p3-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #f)))
(require spd/tags)

(@assignment exams/2023s-f/f-p3)

(@cwl ???)   ;fill in your CWL here (same as for problem sets)


(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line


#|

Consider the following data definitions.

|#
(@htdd Tree Branch)
(define-struct tree   (name branches))
(define-struct branch (num tree))
;;
;; Tree is (make-tree String (listof Branch))
;;
;; Branch is (make-branch Natural Tree)
;;
;; interp. an arb-arity tree in which each subtree has a name, and 
;;         each branch has a number. So unlike simpler arb-arity
;;         trees, in these trees there is an explicit Branch between
;;         a tree and each of its subtrees.

(define TA (make-tree "A" empty))
(define TB (make-tree "B" empty))
(define TC (make-tree "C" empty))
(define TD (make-tree "D" empty))

(define B1 (make-branch 1 TA))
(define B2 (make-branch 2 TB))
(define B3 (make-branch 3 TC))
(define B4 (make-branch 4 TD))

(define TFOO (make-tree "FOO" (list B1 B2)))
(define TBAR (make-tree "BAR" (list B3)))

(define B11 (make-branch 11 TFOO))
(define B12 (make-branch 12 TBAR))

(define TTOP (make-tree "TOP" (list B11 B12 B4)))

(@template-origin encapsulated Tree (listof Branch) Branch)

(define (fn-for-tree t0)
  (local [(define (fn-for-t t)
            (... (tree-name t)
                 (fn-for-lob (tree-branches t))))
          
          (define (fn-for-lob lob)
            (cond [(empty? lob) (...)]
                  [else
                   (... (fn-for-branch (first lob))
                        (fn-for-lob (rest lob)))]))
          
          (define (fn-for-branch b)
            (... (branch-num b)
                 (fn-for-t (branch-tree b))))]

    (fn-for-t t0)))


#|

Complete the design of the function below.

In this problem you must design a function, that for a given tree, produces
a list of the names of nodes for which the immediate parent branch has an
odd number.

For greater certainty, we are giving you 4 check-expects, which you must
not edit. You may add additional check-expects if you like.

(tree-names-on-odd-branches TA) produces empty, because starting at TA
all by itself it is not on any branch at all, so it is definitely not on
an odd branch.

On the other hand, (tree-names-on-odd-branches TFOO) produces (list "A"),
because starting at TFOO, TA is on an odd branch. TB is not.

The remaining tests are correct.

Your answer must include @template-origin and a correct function definition.
There is absolutely no reason to make this function tail recursive.  Instead
you should use ordinary structural recursion. A correct tail recursive version
will receive far fewer marks.

NOTE: This problem will be autograded, and ALL OF THE FOLLOWING ARE ESSENTIAL
      IN YOUR SOLUTION.  Failure to follow these requirements may result in
      receiving zero marks for this problem.

 - The function you design MUST BE CALLED tree-names-on-odd-branches
 
 - You MUST use the encapsulated templates above.
 
 - You MUST NOT RENAME any of the local functions within those templates.
 
 - You MUST NOT RENAME any of the parameters of those local functions.
 
 - You MUST USE ALL of the local functions within those templates.

 - You MUST NOT EDIT above the line marked with ***.
 
 - You MUST NOT COMMENT out any @ metadata tags.
 
 - The file MUST NOT have any errors when the Check Syntax button is pressed.
   Press Check Syntax and Run often, and correct any errors early.
 
 - You MUST FOLLOW all applicable design rules.


|#

(@htdf tree-names-on-odd-branches)
(@signature Tree -> (listof String))
;; produce names of tree nodes that are directly on an odd branch
(check-expect (tree-names-on-odd-branches TA)   empty)
(check-expect (tree-names-on-odd-branches TFOO) (list "A"))
(check-expect (tree-names-on-odd-branches TBAR) (list "C"))
(check-expect (tree-names-on-odd-branches TTOP)  (list "FOO" "A" "C"))

;; *** YOU MUST NOT EDIT ABOVE THIS LINE ***

; (define (tree-names-on-odd-branches t) empty) ;stub


(define (tree-names-on-odd-branches t0)
  (local [
          ;; Tree -> (list of String)
          ;; 这个node能到哪些节点（奇数branch）
          (define (fn-for-t t)
            (fn-for-lob (tree-branches t)))

          ;; List of Branch -> (list of String)
          (define (fn-for-lob lob)
            (cond [(empty? lob) empty]
                  [else
                   (append (fn-for-branch (first lob))
                        (fn-for-lob (rest lob)))]))

          ;; Branch -> (list of String)
          ;; 这个branch能到哪些节点(奇数branch)
          (define (fn-for-branch b)
            (if (odd? (branch-num b))
                (fn-for-t (barnch-tree t))
                empty
                ))
          ]
    

    (fn-for-t t0)))
