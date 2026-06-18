;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname 2020w1-f-p3-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment exams/2020w1-f/f-p3)

(@cwl ???)   ;fill in your CWL here (same as for problem sets)

(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line

#|

This is the Tree definition we used in a number of lectures towards the end
of the term.  But, it has a different example tree.  (See below for a link
to a picture of the new example tree.)

|#

(@htdd Tree)

(define-struct node (name subs))
;; Tree is (make-node String (listof Tree))
;; interp. a bare bones arbitrary arity tree, each node has a name and subs
#;
(define (fn-for-tree t)  
  (local [(define (fn-for-t t)
            (... (node-name t)
                 (fn-for-lot (node-subs t))))
          
          (define (fn-for-lot lot)
            (cond [(empty? lot) (...)]
                  [else
                   (... (fn-for-t (first lot))
                        (fn-for-lot (rest lot)))]))]
    
    (fn-for-t t)))

(define V (make-node "V" empty))
(define W (make-node "W" empty))
(define X (make-node "X" empty))
(define Y (make-node "Y" empty))

(define S (make-node "S" (list V W)))
(define T (make-node "T" (list X)))
(define U (make-node "U" (list Y)))

(define R (make-node "R" (list S T U)))


#|

Refer to the diagram in 2020w1-f-p3.pdf.  It depicts the example tree named R
defined above.

Now consider a function that searches through the tree R.  The function:
   is based on the Tree and (listof Tree) templates
   it has fn-for-t and fn-for-lot mutually recursive functions
   is tail recursive
   has a visited accumulator
   and uses tandem worklists to maintain the path at each point

Exactly what value the function computes does not matter for this question.

In this question you have to use your understanding of how such functions work
to determine the value of certain accumulators at different points in the
function's traversal of the tree.

The numbers in the picture refer to the point at which the fn-for-t
function is CALLED with the associated tree.  NOTE THAT WE ARE TALKING
ABOUT fn-for-t, NOT fn-for-lot

So, at:
  point 1   fn-for-t is called with R plus accumulators
  point 2   fn-for-t is called with S plus accumulators
  and so on

At point 1 in the picture, where the trampoline CALLS fn-for-t with R, the
value of visited is empty, the value of tree-wl is empty, and the value of
path-wl is empty.

We want you to figure out the value of visited, tree-wl, and path-wl at points

   3 when fn-for-t is called with V
   5 when fn-for-t is called with T
   7 when fn-for-t is called with U

For the visited accumulator the values must be in order from first visited to
last.  Path values must be in order from top of tree to bottom. Worklist values
must be in the order the tree traversal would naturally put them.  In these
accumulator values you must to use strings like "R" in cases where the
accumulator value would include strings.  Use the named constants R, S, T, etc.
in places where you need a Tree value.

NOTE 1: We suggest you work out your answer on paper first, double or
triple check it on paper, and then tranfer it into the form we want below.

NOTE 2: Below we want your answer in a very specific form.  Please take
the time to meet that form.

NOTE 3: You must RUN THIS FILE BEFORE SUBMITTING IT.  IF THERE ARE ANY
ERRORS OR ANY TESTS IN THE FILE FAIL THEN ZERO MARKS MAY BE AWARDED.

NOTE 4: The tests at the end of the file are designed to have informative
names.  If you run the file and one of those tests fails then take the
time to read the error message. It can help you fix the problem.

|#

(define visited-values
  (list empty                                       ;at 1
        (list "R" "S")                              ;at 3
        (list "R" "S" "V" "W")                      ;at 5
        (list "R" "S" "V" "W" "T" "X")))            ;at 7

(define tree-wl-values
  (list empty                                       ;at 1
        (list W T U)                                ;at 3
        (list U)                                    ;at 5
        (list)))                                    ;at 7

(define path-wl-values
  (list empty                                       ;at 1
        (list (list "R" "S") (list "R") (list "R")) ;at 3
        (list (list "R"))                           ;at 5
        (list)))                                    ;at 7


  

;;============================================================================
;;============================================================================
;;============================================================================
;;
;; The code below here ensures that running the file will verify that your
;; answers are well-formed.  You do not need to and SHOULD NOT READ this code.
;; You MUST NOT EDIT this code.
;;

(define TREES      (list R S T U V W X Y))
(define TREE-NAMES (map node-name TREES))

(define (tree-name? x) (member x TREE-NAMES))
(define (tree?      x) (member x TREES))

(define (lo p)
  (lambda (x) (and (list? x) (andmap p x))))


(define (is-list-of-four-elements x) (and (list? x) (= (length x) 4)))

;; (lo (lo x))
(define (is-list-of-list-of-string l)    ((lo (lo string?)) l))
(define (is-list-of-list-of-tree-name l) ((lo (lo tree-name?)) l))
(define (is-list-of-list-of-tree l)      ((lo (lo tree?)) l))

;; (lo (lo (lo x)))
(define (is-list-of-list-of-list-of-string l)    ((lo (lo (lo string?))) l))
(define (is-list-of-list-of-list-of-tree-name l) ((lo (lo (lo tree-name?))) l))


(check-satisfied visited-values is-list-of-four-elements)
(check-satisfied visited-values is-list-of-list-of-string)
(check-satisfied visited-values is-list-of-list-of-tree-name)

(check-satisfied tree-wl-values is-list-of-four-elements)
(check-satisfied tree-wl-values is-list-of-list-of-tree)

(check-satisfied path-wl-values is-list-of-four-elements)
(check-satisfied path-wl-values is-list-of-list-of-list-of-string)
(check-satisfied path-wl-values is-list-of-list-of-list-of-tree-name)

