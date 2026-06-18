;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p6-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #t #t none #f () #f)))
(require spd/tags)

(@assignment exams/2022w2-f/f-p6)

(@cwl ???)   ;fill in your CWL here (same as for problem sets)


(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
(@problem 4) ;do not edit or delete this line
(@problem 5) ;do not edit or delete this line
(@problem 6) ;do not edit or delete this line


#|

[10, 14, 20, or 27 points see below for details]

This problem involves designing a function that operates on a graph. 

YOU HAVE A CHOICE BETWEEN FOUR DIFFERENT VERSIONS OF THE FUNCTION TO DESIGN.

This choice is intended to give everyone a chance to work with a version of the
problem with which they are more comfortable. While each version is worth a
different number of maximum possible points, completing even the lowest point
version correctly will almost certainly earn more marks than an incomplete or
incorrect version of a more difficult version.

But note that you MUST ONLY HAND IN ONE VERSION.  You can try to solve multiple
versions of course.  But in the end, you must submit a file in which only one
version is uncommented.  If you submit more than one uncommented version you
will receive 0 points for the entire problem.

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
;; have to add that.
;;

(@template-origin encapsulated Node (listof String) String)

(define (fn-for-graph start-node-name map)  
  (local [(define (fn-for-node n prev path)
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

Again, in this problem you must design one of FOUR POSSIBLE functions. All of 
the functions are called find-path, all of them consume a start node name, a to
node name, and a map. But the different versions have different behaviour as
follows:

V1 - 10 possible points

This function looks for a path from the node named start all the way to the
node named to. If it finds such a path it produces true, otherwise it fails.


V2 - 14 possible points

This function has the same behaviour as in V1, except that if it finds such
a path it produces a list of the names of the nodes on the path from the
node named start all the way to the node named to, including start at the
beginning of the list and to at the end of the list.  If there is more than one
path it should produce the first one it finds. If there is no path it should
fail.

For example, with the V2 version of find-path:

 (find-path "A" "D" MAP)  produces (list "A" "B" "C" "E" "D")


V3 - 20 possible points

This function has the same behaviour as in V2, except that it only finds paths
in which the nodes are in increasing alphabetical order. If there is no such
path it should fail. 

With the V3 version of find-path:

 (find-path "A" "D" MAP)  produces (list "A" "B" "C" "D")

It rejects the path that goes to "E" after "C", because that path then goes
to "D" after "E", which is not in alphabetical order.

Note that string>? checks alphabetical order, and that as an important detail,
(string>? X "") produces true if X is any string other than "". 


V4 - 27 possible points

This function has identical behaviour to the V3 function, but the function
must be tail recursive.



NOTE: This problem will be autograded, and ALL OF THE FOLLOWING ARE ESSENTIAL
      IN YOUR SOLUTION.  Failure to follow these requirements may result in
      receiving zero marks for this problem.

 - The function you design MUST BE CALLED find-path.
 - You MUST INCLUDE @htdf, @signature, and @template-origin metadata tags.
 - Your solution must use the encapsulated template provided above. You will of 
   course have to make additions to those templates.
 - You must not rename any of the local functions in the templates.
 - You must not delete or comment out any local functions in the templates.
 - Your submission MUST PASS the Check Syntax button.
 - You MUST FOLLOW all applicable design rules.

REMEMBER - YOU MUST SUBMIT THE DESIGN OF ONE VERSION OF THE FUNCTION ONLY.
MAKE SURE YOUR @SIGNATURE, PURPOSE, CHECK-EXPECTS, @TEMPLATE-ORIGIN AND 
FUNCTION DEFINITION ARE ALL FOR THE SAME VERSION OF THE FUNCTION.


|#

(@htdf find-path)

(define (find-path start to map) false)



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
        (make-node "C" (list "E" "D"))
        (make-node "D" (list "E" "F" "G"))
        (make-node "E" (list "D"))
        (make-node "F" (list))
        (make-node "G" (list "F"))))
