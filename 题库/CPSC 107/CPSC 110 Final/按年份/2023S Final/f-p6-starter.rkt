;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p6-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #f)))
(require spd/tags)

(@assignment exams/2023s-f/f-p6)

(@cwl ???)   ;fill in your CWL here (same as for problem sets)


(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
(@problem 4) ;do not edit or delete this line
(@problem 5) ;do not edit or delete this line
(@problem 6) ;do not edit or delete this line


#|

This problem involves designing a function that operates on a graph. 

Please read through the data definition below:
|#
(@htdd Node)
(define-struct node (name nexts))
;; Node is (make-node String (listof String))
;; interp. Nodes in a very simple graph.  Each node has a name and a list
;;         of the nodes to which it is connected.  The node names in nexts
;;         act as 'arrows' in the graph that point from the current node
;;         to next nodes.


(@htdd Map)
;; Map is ???
;; interp. an opaque data type that represents a map from node names to nodes.
;;         Only the provided function get-node knows how to work with a map.
;;
;; CONSTRAINT: A given map has no duplicate node names.
;;
;; We are giving you one map to work with called MAP, and the attached file
;; f-p6-figure.pdf includes a diagram of the graph represented by that map.
;; Do not assume that we will only test your function with that map.



;;
;; Here is a STRUCTURALLY RECURSIVE template for working with a graph of these
;; nodes.  Note that this template DOES NOT INCLUDE cycle detection. You will
;; have to add that.  You will also have to convert this to use tail recursion.
;;

(@template-origin encapsulated Node (listof String) String)

(define (fn-for-graph start-node-name map)
  (local [(define (fn-for-node n)
            (... (node-name n)
                 (fn-for-lonn (node-nexts n))))

          (define (fn-for-lonn lonn)
            (cond [(empty? lonn) (...)]
                  [else
                   (... (fn-for-node-name (first lonn))
                        (fn-for-lonn (rest lonn)))]))

          (define (fn-for-node-name nn)
            (fn-for-node (get-node nn map)))]  ;this is a generative step

    (fn-for-node-name start-node-name)))

#|

The function you design consumes a starting node name and a map, IN THAT
ORDER.  It produces a list of the names of all nodes in the map, that are
joins in the graph, when starting from start.

For example:

 (joins "A" MAP) produces (list "D" "F")

because starting at "A", and traversing the graph

 - D has two arrows into it, one from E and one from C
 - F has two arrows into it, one from D and one from G

Note that E is not included in the result because even though it has two
arrows into it, the arrow from D is part of a cycle.

Also note that starting at "D" or "E" the result is (list "F") because with
those starting points there is only one arrow that points to "D". The arrow
from "C" is no longer reachable.

To eliminate all doubt of what the function must produce we have provided all
check-expects for this graph.  But do not make a function that only works for
this graph - we will test the function with a different graph, and a function
that locks in the answers for the specific example graph will receive 0 marks.

YOUR FUNCTION DEFINITION MUST BE TAIL RECURSIVE.


NOTE: This problem will be autograded, and ALL OF THE FOLLOWING ARE ESSENTIAL
      IN YOUR SOLUTION.  Failure to follow these requirements may result in
      receiving zero marks for this problem.

 - The function you design MUST BE CALLED joins.
 - You MUST INCLUDE a @template-origin metadata tag.
 - You must not edit above or below the lines marked with ***.
 - Your solution must use the encapsulated template provided above. You will of 
   course have to make additions to those templates.
 - You must not rename any of the local functions in the templates.
 - You must not delete or comment out any local functions in the templates.
 - Your submission MUST PASS the Check Syntax button.
 - You MUST FOLLOW all applicable design rules.


|#

(@htdf joins)
(@signature String Map -> (listof String))
;; produce names of nodes where >= 2 arrows enter; ignoring arrows in cycles

(check-expect (joins "A" MAP) (list "D" "F"))
(check-expect (joins "B" MAP) (list "D" "F"))
(check-expect (joins "C" MAP) (list "D" "F"))
(check-expect (joins "D" MAP) (list "F"))
(check-expect (joins "E" MAP) (list "F"))
(check-expect (joins "F" MAP) (list))
(check-expect (joins "G" MAP) (list))

;; *** do not edit above this line ***

(define (joins start-node-name map) empty)










;; *** do not edit below this line ***

;;
;; Consider this to be a primitive function that comes with the data definitions
;; and that given a node name it produces the corresponding node.  Because this
;; consumes a string and generates a node, calling it will amount to a
;; generative step in a recursion through a map of nodes.
;;
(@htdf get-node)
(@signature String -> Node)

(define (get-node name map)
  (local [(define (scan lon)
            (cond [(empty? lon) (error "No node named " name)]
                  [else
                   (if (string=? (node-name (first lon)) name)
                       (first lon)
                       (scan (rest lon)))]))]
    (scan map)))




(define MAP
  (list (make-node "A" (list "B"))
        (make-node "B" (list "A" "C"))
        (make-node "C" (list "E" "D" "F"))
        (make-node "D" (list "E" "F" "G"))
        (make-node "E" (list "D"))
        (make-node "F" (list))
        (make-node "G" (list "F"))))
