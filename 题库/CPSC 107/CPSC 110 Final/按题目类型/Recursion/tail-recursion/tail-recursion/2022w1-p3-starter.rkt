;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p3-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
;; DO NOT PUT ANYTHING PERSONALLY IDENTIFYING BEYOND YOUR CWL IN THIS FILE.

(require spd/tags)

(@assignment exams/2022w1-f/f-p3);Do not edit or remove this tag

(@cwl ???)   ;fill in your CWL here (same as for problem sets)

(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line

#|

NOTE: This problem will be autograded, and ALL OF THE FOLLOWING ARE ESSENTIAL
      IN YOUR SOLUTION.  Failure to follow these requirements may result in
      receiving zero marks for this problem.

 - This file includes special check-expects at the bottom that will check
   whether your answer is well formed when you run the file. If one or more
   answers are not well formed the test will fail with a message that
   describes what needs to be fixed.
 - Run the file EVERY time you edit an answer.
 - Note that initially the tests WILL FAIL for the starter, because they
   want you to edit your answers in before the tests pass.
 - Your submission WILL BE GRADED IF THERE ARE FAILING TESTS.  A failing test
   just means that specific answer is not well formed.
 - BUT your submission will not be graded if running it produces red errors.



Now consider the following data definition:

|#


(@htdd Node)
(define-struct node (name size nexts))
;;
;; Node is (make-node String Natural (listof String))
;; A node in a graph that has:
;;  - the name of the node (these are unique in any given graph)
;;  - the size of the node (these may be duplicated in a given graph)
;;  - a list of the names of the nodes this node has an arrow pointing TO
;;
;; The lookup-node function finds the node with the given name.
;;
;; For example
;; (lookup-node "A") produces (make-node "A" 10 (list "B" "C" "D"))
;;
;; The diagram in f-p3-figure.pdf represents the following graph.  USE THE
;; CONSTANT BELOW TO DETERMINE THE ORDER OF THE ARROWS LEAVING EACH NODE.
;;
(define GRAPH
  (list (make-node "A" 10 (list "B" "C" "D"))
        (make-node "B" 20 (list "E"))
        (make-node "C" 30 (list "E" "F" "A"))
        (make-node "D" 20 (list ))
        (make-node "E" 10 (list "H" "I"))
        (make-node "F" 20 (list "G" "D" "A"))
        (make-node "G" 10 (list "B"))
        (make-node "H" 10 (list ))
        (make-node "I" 10 (list ))))

(define A (list-ref GRAPH 0))
(define B (list-ref GRAPH 1))
(define C (list-ref GRAPH 2))
(define D (list-ref GRAPH 3))
(define E (list-ref GRAPH 4))
(define F (list-ref GRAPH 5))
(define G (list-ref GRAPH 6))
(define H (list-ref GRAPH 7))
(define I (list-ref GRAPH 8))

(define (fn-for-graph start-node-name)
  (local [(define (fn-for-node n)
            (... (node-name n)
                 (node-size n)
                 (fn-for-los (node-nexts n))))
          
          (define (fn-for-los los)
            (cond [(empty? los) (...)]
                  [else
                   (... (fn-for-string (first los))
                        (fn-for-los (rest los)))]))

          (define (fn-for-string s)
            (... (fn-for-node (lookup-node s))))]
    
    (fn-for-string start-node-name)))


#|
PART 1
Now consider a function that searches through the graph starting at node A.
The function:
   is based on the encapsulated templates above
   is tail recursive (so the above templates were converted to be TR)
   has a primary worklist of type (listof String)
   has a tandem worklist of paths of type (listof (listof String))
   has a visited accumulator of type (listof String)
   it uses the path accumulator to stop at cycles
   but even though it has a visited accumulator it proceeds at joins

Exactly what value the function computes does not matter for this question.

In this question you have to use your understanding of how such functions work
to determine the value of certain accumulators at different points in the
function's traversal of the graph.

The letters in the diagram refer to the point at which the fn-for-node function
is CALLED with the associated node as an argument.  NOTE THAT WE ARE TALKING
ABOUT CALLS TO fn-for-node, NOT calls to fn-for-los

So, at:
  point A   fn-for-node is called with A plus accumulators
  point C   fn-for-node is called with C plus accumulators
  and so on

When fn-for-node is initially called, at point A in the picture, the value of
visited is empty, the value of node-wl is empty, and the value of path-wl is
empty.

We want you to figure out the value of visited, node-wl, and path-wl at points

   when fn-for-node is called with E the first time E1
   when fn-for-node is called with E the second time E2
   when fn-for-node is called with G

Note the following
  - For the visited accumulator the values must be in order from first visited
    to last.
  - Path values must be in order from start of graph to current node
  - Worklist values must be in the order the graph traversal would naturally
    put them.

You MUST follow the accumulator types below. 
 
NOTE 1: We suggest you work out your answer on paper first, double or
triple check it on paper, and then transfer it into the form we want below.

NOTE 2: Below we want your answer in a very specific form. Please take
the time to meet that form.

|#

;; each visited-at answer must be a list of node names "A", "B" etc.
(define visited-at-A  (list))  ;do not change this one, it is correct
(define visited-at-E1 (list ))
(define visited-at-E2 (list ))
(define visited-at-G  (list ))

;; each node-wl-at answer must be a list of nodes names "A", "B" etc.
(define node-wl-at-A  (list))  ;do not change this one, it is correct
(define node-wl-at-E1 (list ))
(define node-wl-at-E2 (list ))
(define node-wl-at-G  (list ))

;; each path-wl-at answer must be a list of lists of node names "A", "B" etc.
(define path-wl-at-A  (list))  ;do not change this one, it is correct
(define path-wl-at-E1 (list ))
(define path-wl-at-E2 (list ))
(define path-wl-at-G  (list ))


#|

PART 2: 

In this last part of the problem we want you to consider the design of four 
different functions operating on the graph. In each case we will describe the 
function and ask you to specify which accumulator(s) is/are needed for that
function definition. 

Below is a description of each function along with space to answer the 4
questions about each function.  You should answer all these questions for all
four functions below. The questions are:

- Does the function require a rsf accumulator?
- Does the function require a path accumulator?
- Does the function require a visited accumulator?
- How many worklists does the function require?

|#

#|

PART 2A
This function must use tail recursion. It consumes a starting node name and
produces the total size of all nodes reachable from that starting node. Note
that the size of each node should only be counted once.

|#

(define part-2a-rsf-accumulator?     "???") ;"yes" or "no"
(define part-2a-path-accumulator?    "???") ;"yes" or "no"
(define part-2a-visited-accumulator? "???") ;"yes" or "no"
(define part-2a-worklists?           -1)    ;a natural number, 0, 1, 2...


#|

PART 2B
This function must use tail recursion. It consumes a starting node name and
produces a list of the names of all nodes that have a size greater than the
previous node in the traversal. Note that some nodes are reachable from more
than one prior node, so a node not included because of one prior node might be
included because of another prior node.

|#

(define part-2b-rsf-accumulator?     "???") ;"yes" or "no"
(define part-2b-path-accumulator?    "???") ;"yes" or "no"
(define part-2b-visited-accumulator? "???") ;"yes" or "no"
(define part-2b-worklists?           -1)    ;a natural number, 0, 1, 2...


#|

PART 2C
This function must use structural recursion. It consumes a starting node name,
a destination node name and produces the first path to the destination if found
or fails otherwise.

|#

(define part-2c-rsf-accumulator?     "???") ;"yes" or "no"
(define part-2c-path-accumulator?    "???") ;"yes" or "no"
(define part-2c-visited-accumulator? "???") ;"yes" or "no"
(define part-2c-worklists?           -1)    ;a natural number, 0, 1, 2...


#|

PART 2D
This function must use tail recursion. It consumes a starting node name, a
destination node name and produces the first path to the destination if found
or fails otherwise.

|#

(define part-2d-rsf-accumulator?     "???") ;"yes" or "no"
(define part-2d-path-accumulator?    "???") ;"yes" or "no"
(define part-2d-visited-accumulator? "???") ;"yes" or "no"
(define part-2d-worklists?           -1)    ;a natural number, 0, 1, 2...



;; ==========================================================
;; >>>>>>>>>> YOU DO NOT NEED TO READ BELOW HERE <<<<<<<<<<<<
;; ==========================================================
;;
;; The code below here ensures that running the file will verify that your
;; answers are well-formed.  You do not need to and SHOULD NOT READ this code.
;; You MUST NOT EDIT this code.
;;

(define (lo p)
  (lambda (x) (and (list? x) (andmap p x))))


;; these are named to work well with check-satisfied failures

(define (is-natural x)
  (and (integer? x) (>= x 0)))

(define (is-string-yes-or-no x)
  (or (equal? x "yes")
      (equal? x "no")))

(define (is-list-of-string l)         ((lo string?) l))
(define (is-list-of-list-of-string l) ((lo (lo string?)) l))


; PART 1
(check-satisfied visited-at-A  is-list-of-string)
(check-satisfied visited-at-E1 is-list-of-string)
(check-satisfied visited-at-E2 is-list-of-string)
(check-satisfied visited-at-G  is-list-of-string)

(check-satisfied node-wl-at-A  is-list-of-string)
(check-satisfied node-wl-at-E1 is-list-of-string)
(check-satisfied node-wl-at-E2 is-list-of-string)
(check-satisfied node-wl-at-G  is-list-of-string)

(check-satisfied path-wl-at-A  is-list-of-list-of-string)
(check-satisfied path-wl-at-E1 is-list-of-list-of-string)
(check-satisfied path-wl-at-E2 is-list-of-list-of-string)
(check-satisfied path-wl-at-G  is-list-of-list-of-string)

; PART 2
(check-satisfied part-2a-rsf-accumulator?     is-string-yes-or-no)
(check-satisfied part-2a-path-accumulator?    is-string-yes-or-no)
(check-satisfied part-2a-visited-accumulator? is-string-yes-or-no)
(check-satisfied part-2a-worklists?           is-natural)

(check-satisfied part-2b-rsf-accumulator?     is-string-yes-or-no)
(check-satisfied part-2b-path-accumulator?    is-string-yes-or-no)
(check-satisfied part-2b-visited-accumulator? is-string-yes-or-no)
(check-satisfied part-2b-worklists?           is-natural)

(check-satisfied part-2c-rsf-accumulator?     is-string-yes-or-no)
(check-satisfied part-2c-path-accumulator?    is-string-yes-or-no)
(check-satisfied part-2c-visited-accumulator? is-string-yes-or-no)
(check-satisfied part-2c-worklists?           is-natural)


(check-satisfied part-2d-rsf-accumulator?     is-string-yes-or-no)
(check-satisfied part-2d-path-accumulator?    is-string-yes-or-no)
(check-satisfied part-2d-visited-accumulator? is-string-yes-or-no)
(check-satisfied part-2d-worklists?           is-natural)
